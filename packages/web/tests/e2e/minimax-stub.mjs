/**
 * Stands in for api.minimax.io during e2e runs.
 *
 * The real API costs money, needs a key in CI, and varies its wording — none
 * of which suits an assertion. This mirrors the parts the client actually
 * reads: the OpenAI-shaped envelope, `usage` (including the cached-token
 * detail that drives pricing), and `base_resp`, which is where MiniMax reports
 * failures despite returning HTTP 200.
 *
 * The reply is markdown on purpose: rendering it is the behaviour under test.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MINIMAX_STUB_PORT ?? 9110);

const REPLY = [
  'Here is the plan:',
  '',
  '1. **Draft the outline** before anything else.',
  '2. **Pull the numbers** from last quarter.',
  '',
  'Ask again if you want the checklist.',
].join('\n');

createServer((req, res) => {
  // Playwright's webServer readiness probe only accepts <400, so this must 200.
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    return;
  }
  if (!req.url.endsWith('/text/chatcompletion_v2')) {
    res.writeHead(404, { 'Content-Type': 'application/json' }).end('{}');
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    // An empty message is the hook for exercising the failure path.
    const failing = body.includes('__FAIL__');
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify(
        failing
          ? { base_resp: { status_code: 1004, status_msg: 'login fail' } }
          : {
              id: 'stub',
              object: 'chat.completion',
              model: 'MiniMax-M3',
              choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: REPLY } }],
              usage: {
                prompt_tokens: 180,
                completion_tokens: 40,
                total_tokens: 220,
                prompt_tokens_details: { cached_tokens: 120 },
              },
              base_resp: { status_code: 0, status_msg: '' },
            },
      ),
    );
  });
}).listen(PORT, () => console.log(`minimax stub on :${PORT}`));
