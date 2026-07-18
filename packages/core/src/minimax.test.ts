/**
 * MiniMax client tests with a stubbed fetch — no network, no spend.
 * The important case is that MiniMax signals logical failures with HTTP 200
 * and a non-zero `base_resp.status_code`, so a naive `res.ok` check passes.
 */
import { describe, expect, it, vi } from 'vitest';
import { MiniMaxChatClient, minimaxCostMicros } from './minimax.js';
import { UserFacingError } from './todo-service.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Shaped after a real MiniMax-M3 response, including the fields we ignore. */
const OK_BODY = {
  choices: [
    {
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content: '  Try splitting it in two.  ',
        reasoning_content: 'The user wants a plan. Keep it short.',
      },
    },
  ],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    prompt_tokens_details: { cached_tokens: 0 },
  },
  base_resp: { status_code: 0, status_msg: '' },
};

function client(fetchImpl: typeof fetch) {
  return new MiniMaxChatClient({ apiKey: 'test-key', fetchImpl });
}

describe('minimaxCostMicros', () => {
  it('prices input and output at their separate rates', () => {
    // 1M input @ $0.30 = 300_000 micros; 1M output @ $1.20 = 1_200_000 micros.
    expect(minimaxCostMicros('MiniMax-M3', 1_000_000, 0)).toBe(300_000);
    expect(minimaxCostMicros('MiniMax-M3', 0, 1_000_000)).toBe(1_200_000);
    expect(minimaxCostMicros('MiniMax-M3', 1_000_000, 1_000_000)).toBe(1_500_000);
  });

  it('rounds sub-micro amounts up so tiny calls are never free', () => {
    expect(minimaxCostMicros('MiniMax-M3', 1, 0)).toBe(1);
  });

  it('falls back to the default model rate for an unknown model', () => {
    expect(minimaxCostMicros('some-future-model', 1_000_000, 0)).toBe(300_000);
  });

  it('bills cached prompt tokens at the cache-read rate', () => {
    // 1M cached input @ $0.06 rather than $0.30.
    expect(minimaxCostMicros('MiniMax-M3', 1_000_000, 0, 1_000_000)).toBe(60_000);
  });

  it('splits a partly-cached prompt between the two input rates', () => {
    // 200k fresh @ $0.30 = 60_000; 800k cached @ $0.06 = 48_000.
    expect(minimaxCostMicros('MiniMax-M3', 1_000_000, 0, 800_000)).toBe(108_000);
  });

  it('never lets a cached count exceed the prompt and undercharge', () => {
    // A cached figure larger than prompt_tokens must not produce a negative
    // fresh slice — clamp to the prompt total.
    expect(minimaxCostMicros('MiniMax-M3', 1_000, 0, 999_999)).toBe(
      minimaxCostMicros('MiniMax-M3', 1_000, 0, 1_000),
    );
  });

  it('treats a missing cached count as fully fresh', () => {
    expect(minimaxCostMicros('MiniMax-M3', 1_000_000, 0)).toBe(
      minimaxCostMicros('MiniMax-M3', 1_000_000, 0, 0),
    );
  });
});

describe('MiniMaxChatClient', () => {
  it('sends an OpenAI-shaped body with the system prompt first', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(OK_BODY)) as unknown as typeof fetch;
    await client(fetchImpl).complete({
      system: 'You help with one task.',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!;
    expect(url).toBe('https://api.minimax.io/v1/text/chatcompletion_v2');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');

    const body = JSON.parse(init.body as string);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You help with one task.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'hi' });
    // MiniMax names the output cap differently from OpenAI.
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    expect(body.max_tokens).toBeUndefined();
    // Their temperature range is (0, 1] — 2.0 would be rejected.
    expect(body.temperature).toBeGreaterThan(0);
    expect(body.temperature).toBeLessThanOrEqual(1);
  });

  it('returns trimmed content with token usage and cost', async () => {
    const result = await client(
      (async () => jsonResponse(OK_BODY)) as unknown as typeof fetch,
    ).complete({ system: 's', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).toBe('Try splitting it in two.');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.costMicros).toBe(minimaxCostMicros('MiniMax-M3', 100, 50));
  });

  it('excludes the reasoning trace from the reply shown to the user', async () => {
    const result = await client(
      (async () => jsonResponse(OK_BODY)) as unknown as typeof fetch,
    ).complete({ system: 's', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.content).not.toContain('The user wants a plan');
  });

  it('discounts the cached slice of the prompt', async () => {
    // Mirrors real traffic: the replayed system prompt and history come back cached.
    const cachedBody = {
      ...OK_BODY,
      usage: {
        prompt_tokens: 177,
        completion_tokens: 32,
        prompt_tokens_details: { cached_tokens: 163 },
      },
    };
    const result = await client(
      (async () => jsonResponse(cachedBody)) as unknown as typeof fetch,
    ).complete({ system: 's', messages: [{ role: 'user', content: 'hi' }] });

    expect(result.costMicros).toBe(minimaxCostMicros('MiniMax-M3', 177, 32, 163));
    // Materially cheaper than charging every prompt token at the fresh rate.
    expect(result.costMicros).toBeLessThan(minimaxCostMicros('MiniMax-M3', 177, 32, 0));
  });

  it('throws on a logical error even though the HTTP status is 200', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        base_resp: { status_code: 1004, status_msg: 'invalid api key' },
      })) as unknown as typeof fetch;

    await expect(
      client(fetchImpl).complete({ system: 's', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/invalid api key/);
  });

  it('throws a user-facing error on an HTTP failure', async () => {
    const fetchImpl = (async () => jsonResponse({}, 502)) as unknown as typeof fetch;
    await expect(
      client(fetchImpl).complete({ system: 's', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it('rejects an empty completion rather than storing a blank reply', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content: '   ' } }],
        base_resp: { status_code: 0 },
      })) as unknown as typeof fetch;

    await expect(
      client(fetchImpl).complete({ system: 's', messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/empty response/);
  });
});
