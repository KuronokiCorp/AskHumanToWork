import { expect, test } from '@playwright/test';

/**
 * Social sign-in, driven against the local Supabase stub (see
 * playwright.config.ts). Supabase only brokers the provider hand-off — the
 * session that comes out the other end is one of ours, which is what these
 * tests actually pin down.
 */

test('signing in with Google lands in the app with a real session', async ({ page }) => {
  await page.goto('/login');

  const google = page.getByRole('link', { name: /Continue with Google/ });
  await expect(google).toBeVisible({ timeout: 15_000 });
  await google.click();

  // Straight into the app: the token came back in the fragment, was exchanged
  // for a session, and the shell rendered.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText('google-user@stub.local')).toBeVisible();

  // Our own session cookie, not a Supabase one.
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'sessionId')).toBe(true);

  // And it is a genuine session: an authenticated endpoint answers.
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(200);
  expect((await me.json()).email).toBe('google-user@stub.local');
});

test('the access token never survives in the URL', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /Continue with GitHub/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  // The fragment is stripped before anything can copy or bookmark it.
  expect(page.url()).not.toContain('access_token');
});

test('a forged token is refused', async ({ page }) => {
  await page.goto('/login');
  const res = await page.request.post('/api/auth/oauth/callback', {
    data: { accessToken: 'forged-not-issued-by-supabase' },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(401);

  // No session was handed out on the way past.
  const me = await page.request.get('/api/auth/me', { failOnStatusCode: false });
  expect(me.status()).toBe(401);
});

test('signing in twice reuses the account instead of duplicating it', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  const first = await (await page.request.get('/api/auth/me')).json();
  await page.request.post('/api/auth/logout');

  await page.goto('/login');
  await page.getByRole('link', { name: /Continue with Google/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  const second = await (await page.request.get('/api/auth/me')).json();
  expect(second.id).toBe(first.id);
});
