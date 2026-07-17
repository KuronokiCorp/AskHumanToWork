import { expect, test } from '@playwright/test';

/** Mobile-only behaviors (Pixel 5 viewport): hamburger + overlay menu. */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('askhumantowork', { exact: true })).toBeVisible({ timeout: 15_000 });
});

test('hamburger is visible, desktop links are hidden', async ({ page }) => {
  const nav = page.locator('nav');
  await expect(nav.getByRole('button', { name: 'Toggle menu' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'GitHub' })).toBeHidden();
  await expect(nav.getByRole('link', { name: 'Sign in' })).toBeHidden();
});

test('toggling the hamburger opens and closes the overlay menu', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Toggle menu' });
  // Overlay exists but is transparent + click-through when closed.
  const overlayLink = page.getByRole('link', { name: 'Sign in' }).last();

  await toggle.click();
  await expect
    .poll(async () =>
      overlayLink.evaluate((el) => {
        const overlay = el.closest('div')!;
        return getComputedStyle(overlay).opacity;
      }),
    )
    .toBe('1');
  await expect(overlayLink).toBeVisible();

  await toggle.click();
  await expect
    .poll(async () =>
      overlayLink.evaluate((el) => {
        const overlay = el.closest('div')!;
        return getComputedStyle(overlay).opacity;
      }),
    )
    .toBe('0');
});
