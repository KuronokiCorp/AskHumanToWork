/**
 * Stands in for a Supabase Auth project during e2e runs.
 *
 * Only two things matter to us: `/auth/v1/authorize`, which the real Supabase
 * would hand off to Google/GitHub and then bounce back with the token in the
 * URL *fragment*, and `/auth/v1/user`, which is how the API verifies a token
 * rather than trusting a JWT it merely parsed.
 *
 * Tokens are dumb on purpose: "valid-<email>" resolves to that email, and
 * anything else 401s — enough to prove the exchange path and that a forged
 * token is refused, without standing up real OAuth.
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.SUPABASE_STUB_PORT ?? 9120);
const VALID = 'valid-';

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Playwright's readiness probe only accepts <400.
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    return;
  }

  // The provider hand-off. The real thing redirects through Google/GitHub;
  // here we go straight back so the test drives the callback deterministically.
  if (url.pathname === '/auth/v1/authorize') {
    const redirect = url.searchParams.get('redirect_to');
    const provider = url.searchParams.get('provider') ?? 'google';
    const email = `${provider}-user@stub.local`;
    res
      .writeHead(302, { Location: `${redirect}#access_token=${VALID}${email}&token_type=bearer` })
      .end();
    return;
  }

  if (url.pathname === '/auth/v1/user') {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!token.startsWith(VALID)) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"msg":"invalid token"}');
      return;
    }
    const email = token.slice(VALID.length);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        id: '00000000-0000-0000-0000-0000000000ab',
        email,
        app_metadata: { provider: 'google' },
      }),
    );
    return;
  }

  res.writeHead(404).end();
}).listen(PORT, () => console.error(`[supabase-stub] :${PORT}`));
