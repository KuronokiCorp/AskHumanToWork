import { expect, test } from '@playwright/test';

/**
 * The logged-out landing page at /: a full-viewport hero over a scaled
 * dashboard mockup. The API is running but nobody is signed in, so /api/me
 * 401s — that is the state which renders this page.
 */

const REPO_URL = 'https://github.com/KuronokiCorp/AskHumanToWork';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The landing appears once the /api/me query settles as an error (retries first).
  await expect(page.getByText('askhumantowork', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('renders the headline over the full viewport', async ({ page }) => {
  await expect(page).toHaveTitle(/AskHumanToWork/);
  await expect(page.getByRole('heading', { name: /Your AI remembers/ })).toBeVisible();
  await expect(page.getByText('You get it done.')).toBeVisible();

  // The hero fills the viewport rather than sitting in a short band.
  const heroHeight = await page
    .locator('div.relative.flex.min-h-\\[100svh\\]')
    .evaluate((el) => el.getBoundingClientRect().height);
  const viewport = page.viewportSize()!.height;
  expect(heroHeight).toBeGreaterThanOrEqual(viewport * 0.9);
});

test('keeps the mono identity — no Helvetica webfont', async ({ page }) => {
  const { fontFamily, background } = await page.evaluate(() => ({
    fontFamily: getComputedStyle(document.body).fontFamily,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  expect(fontFamily).toContain('JetBrains Mono');
  expect(fontFamily).not.toContain('Helvetica');
  expect(background).not.toBe('rgb(0, 0, 0)');
  // No third-party font stylesheet crept in with the redesign.
  expect(await page.locator('link[href*="onlinewebfonts"]').count()).toBe(0);
});

test('capture bar carries a typed todo through to sign-up', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'Capture a todo' });
  await expect(input).toHaveAttribute('placeholder', /Ship the release notes/);

  await input.fill('Review the auth PR @tomorrow 3pm');
  await page.getByRole('button', { name: 'Capture' }).click();

  // Nothing is silently dropped: the draft rides along to /login.
  await page.waitForURL(/\/login\?draft=/);
  expect(decodeURIComponent(page.url())).toContain('Review the auth PR @tomorrow 3pm');
});

test('an empty capture still routes to sign-up', async ({ page }) => {
  await page.getByRole('button', { name: 'Capture' }).click();
  await page.waitForURL(/\/login$/);
});

test('primary and secondary calls to action point at the right targets', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: 'Connect Claude' })).toHaveAttribute(
    'href',
    /github\.com/,
  );
});

test('dashboard mockup renders inside browser chrome, scaled to fit', async ({ page }) => {
  const mockup = page.getByText('askhumantowork.app');
  await mockup.scrollIntoViewIfNeeded();
  await expect(mockup).toBeVisible();

  // Illustrative agenda content, including the provenance the product is about.
  await expect(page.getByText('AI Inbox').first()).toBeVisible();
  await expect(page.getByText('CAPTURED', { exact: true })).toBeVisible();
  await expect(page.getByText('claude-code').first()).toBeVisible();

  // ScaledDashboard must shrink the 896px design to the container, never
  // overflow it — a horizontal scrollbar here would break the whole page.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});

test('entrance animations are declared and settle to visible', async ({ page }) => {
  const headline = page.getByText('Your AI remembers.');
  await expect(headline).toHaveClass(/animate-fade-up/);
  await expect.poll(async () => headline.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
});

test('desktop nav: links + Sign in CTA, hamburger hidden', async ({ page }) => {
  const nav = page.locator('nav');
  for (const label of ['How it works', 'MCP', 'GitHub']) {
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
