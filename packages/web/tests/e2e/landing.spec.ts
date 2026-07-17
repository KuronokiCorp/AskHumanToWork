import { expect, test } from '@playwright/test';

/**
 * Reviews tasks 1+2: the developer landing page at / (logged-out) in the
 * light-minimal-mono "Claude Code" style. No backend runs; /api/me 500s,
 * which is the logged-out state that renders the landing.
 */

const TYPEWRITER_TEXT =
  'Your agents capture todos over MCP. You do the work. One agenda, escalating reminders, full provenance.';
const MCP_COMMAND =
  'claude mcp add heyhuman --env TODO_API_TOKEN=<your-token> -- npx -y heyhuman-mcp';
const REPO_URL = 'https://github.com/KuronokiCorp/AskHumanToWork';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The landing appears once the /api/me query settles as an error (retries first).
  await expect(page.getByText('askhumantowork', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('renders the shell: title, logo, decorative asterisk', async ({ page }) => {
  await expect(page).toHaveTitle(/AskHumanToWork/);
  await expect(page.getByText('✳︎')).toBeVisible();
});

test('task 2 style: mono font, light background, no Helvetica', async ({ page }) => {
  const { fontFamily, background } = await page.evaluate(() => ({
    fontFamily: getComputedStyle(document.body).fontFamily,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  expect(fontFamily).toContain('JetBrains Mono');
  expect(fontFamily).not.toContain('Helvetica');
  // zinc-100/70 body on a zinc-50 page wrapper — both light, not near-black.
  expect(background).not.toBe('rgb(0, 0, 0)');
  // The old Helvetica webfont stylesheets must be gone from the document.
  const helveticaLinks = await page
    .locator('link[href*="onlinewebfonts"]')
    .count();
  expect(helveticaLinks).toBe(0);
});

test('typewriter types the full line, then the cursor disappears', async ({ page }) => {
  // Cursor is visible while typing…
  await expect(page.getByTestId('cursor')).toBeVisible();
  // …the full text lands (105 chars × 38ms ≈ 4s after the 600ms delay)…
  await expect(page.getByText(TYPEWRITER_TEXT)).toBeVisible({ timeout: 15_000 });
  // …and the cursor unmounts when done.
  await expect(page.getByTestId('cursor')).toHaveCount(0);
});

test('action pills fade in and link to the right targets', async ({ page }) => {
  const pills = page.getByTestId('pills');
  await expect(pills).toBeVisible();
  // Fade-in completed (opacity animates 0 → 1 at ~400ms).
  await expect
    .poll(async () => pills.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  await expect(pills.getByRole('link', { name: 'Quick start' })).toHaveAttribute(
    'href',
    /github\.com/,
  );
  await expect(pills.getByRole('link', { name: 'Get a token' })).toHaveAttribute('href', '/login');
});

test('terminal block shows the MCP quick-start command', async ({ page }) => {
  await expect(page.getByText(MCP_COMMAND)).toBeVisible();
  await expect(page.getByText('✓ connected', { exact: false })).toBeVisible();
});

test('product screenshot renders below the fold', async ({ page }) => {
  const img = page.getByRole('img', { name: /agenda/i });
  await img.scrollIntoViewIfNeeded();
  await expect(img).toBeVisible();
  // The asset actually loads (not a broken link).
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);
});

test('copy pill writes the MCP command to the clipboard', async ({ page }) => {
  await page.getByRole('button', { name: /Copy: claude mcp add heyhuman/ }).click();
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(MCP_COMMAND);
});

test('desktop nav: links + Sign in CTA, hamburger hidden', async ({ page }) => {
  const nav = page.locator('nav');
  for (const label of ['How it works', 'MCP', 'API', 'GitHub']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', REPO_URL);
  await expect(nav.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Toggle menu' })).toBeHidden();
});

test('routing: /login renders the login form, not the landing', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
