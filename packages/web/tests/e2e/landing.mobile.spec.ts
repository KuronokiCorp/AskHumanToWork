import { expect, test } from '@playwright/test';

/** Mobile-only behaviours (Pixel 5 viewport): hamburger + dropdown menu. */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('askhumantowork', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('hamburger is visible, desktop links are hidden', async ({ page }) => {
  const nav = page.locator('nav');
  await expect(nav.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'GitHub' })).toBeHidden();
  // The sign-in CTA stays on the bar at every width — it is the primary action.
  await expect(nav.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('toggling the hamburger opens and closes the dropdown', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  const menu = page.getByTestId('mobile-menu');

  await expect(menu).toHaveCount(0);

  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'GitHub' })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await toggle.click();
  await expect(menu).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('hero still fits: headline, capture bar and actions all reachable', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Your AI remembers/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Capture a todo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start free' })).toBeVisible();

  // No sideways scroll on a narrow screen — the scaled mockup is the risk here.
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflows).toBe(false);
});
