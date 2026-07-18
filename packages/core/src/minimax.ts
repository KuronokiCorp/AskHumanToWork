import type { ChatCompletion, ChatModelClient, ChatModelMessage } from './todo-chat-service.js';
import { UserFacingError } from './todo-service.js';

/**
 * MiniMax chat client.
 *
 * The API is OpenAI-shaped but differs in three ways that matter, so this is a
 * hand-rolled fetch rather than the OpenAI SDK pointed at their base URL:
 *   1. the output cap is `max_completion_tokens`, not `max_tokens`
 *   2. `temperature` is bounded to (0, 1], not (0, 2]
 *   3. logical failures still return HTTP 200 — the real status is in `base_resp`
 *
 * Docs: https://platform.minimax.io/docs/api-reference/text-post
 */

/** International host. Mainland China accounts use https://api.minimaxi.com/v1. */
const DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_MODEL = 'MiniMax-M3';
const DEFAULT_MAX_TOKENS = 1_024;

/**
 * Price per 1M tokens in micro-USD, per platform.minimax.io/docs/guides/pricing-paygo
 * (verified 2026-07-18): MiniMax-M3 at $0.30 in / $1.20 out.
 *
 * These rates are the ≤512k-context tier; MiniMax doubles them above 512k
 * context. A per-todo chat is nowhere near that, but if this client is ever
 * reused for long-context work the rates must be tiered.
 */
export const MINIMAX_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'MiniMax-M3': { inputPerMTok: 300_000, outputPerMTok: 1_200_000 },
  'MiniMax-M2.7': { inputPerMTok: 300_000, outputPerMTok: 1_200_000 },
  'MiniMax-M2.7-highspeed': { inputPerMTok: 600_000, outputPerMTok: 2_400_000 },
};

export function minimaxCostMicros(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MINIMAX_PRICING[model] ?? MINIMAX_PRICING[DEFAULT_MODEL]!;
  return Math.ceil(
    (inputTokens * rate.inputPerMTok + outputTokens * rate.outputPerMTok) / 1_000_000,
  );
}

export interface MiniMaxConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  /** Overridable so tests don't hit the network. */
  fetchImpl?: typeof fetch;
}

interface MiniMaxResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  base_resp?: { status_code?: number; status_msg?: string };
}

export class MiniMaxChatClient implements ChatModelClient {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private config: MiniMaxConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.model = config.model ?? DEFAULT_MODEL;
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(req: { system: string; messages: ChatModelMessage[] }): Promise<ChatCompletion> {
    const res = await this.fetchImpl(`${this.baseUrl}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: req.system }, ...req.messages],
        max_completion_tokens: this.maxTokens,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      throw new UserFacingError(`AI service unavailable (HTTP ${res.status})`);
    }

    const body = (await res.json()) as MiniMaxResponse;

    // MiniMax returns 200 with a non-zero base_resp.status_code on logical
    // failures (bad key, rate limit, content filter) — so this check, not the
    // HTTP status, is what actually catches errors.
    const status = body.base_resp?.status_code ?? 0;
    if (status !== 0) {
      throw new UserFacingError(
        `AI service error: ${body.base_resp?.status_msg ?? `status ${status}`}`,
      );
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new UserFacingError('AI service returned an empty response');

    const inputTokens = body.usage?.prompt_tokens ?? 0;
    const outputTokens = body.usage?.completion_tokens ?? 0;

    return {
      content,
      model: this.model,
      inputTokens,
      outputTokens,
      costMicros: minimaxCostMicros(this.model, inputTokens, outputTokens),
    };
  }
}
