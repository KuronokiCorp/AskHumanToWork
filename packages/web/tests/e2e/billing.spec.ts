import { expect, test, type Page } from '@playwright/test';

/**
 * Billing settings. The e2e API runs without Stripe keys, which is itself a
 * case worth pinning: the page must degrade to "payments unavailable" rather
 * than offering a card flow that cannot work.
 */

const PASSWORD = 'e2e-password-123';

function uniqueEmail(): string {
  return `e2e-bill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function signup(page: Page): Promise<void> {
  const res = await page.request.post('/api/auth/signup', {
    data: { email: uniqueEmail(), password: PASSWORD, timezone: 'Asia/Tokyo' },
  });
  expect(res.ok()).toBeTruthy();
}

test('billing page shows the free allowance and no card on file', async ({ page }) => {
  await signup(page);
  await page.goto('/settings/billing');

  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No card on file')).toBeVisible();
  await expect(page.getByText(/of \$1\.00 free allowance/)).toBeVisible();
  await expect(page.getByText(/0 replies/)).toBeVisible();
});

test('without Stripe configured, no card flow is offered', async ({ page }) => {
  await signup(page);
  await page.goto('/settings/billing');

  await expect(page.getByText('Payments unavailable')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Add payment method/ })).toHaveCount(0);
});

test('usage on the billing page reflects a sent message', async ({ page }) => {
  await signup(page);
  const res = await page.request.post('/api/todos', { data: { title: 'Spend a little' } });
  const { todo } = (await res.json()) as { todo: { id: string } };

  await page.goto(`/t/${todo.id}`);
  await page.getByPlaceholder('Ask about this task…').fill('hello');
  await page.getByRole('button', { name: /Send/ }).click();
  await expect(page.getByText('Draft the outline')).toBeVisible({ timeout: 15_000 });

  await page.goto('/settings/billing');
  await expect(page.getByText(/1 reply\b/)).toBeVisible({ timeout: 15_000 });
});

test('billing is reachable from the settings nav', async ({ page }) => {
  await signup(page);
  await page.goto('/agenda');
  await page.getByRole('link', { name: 'Billing' }).click();
  await page.waitForURL(/\/settings\/billing/);
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
});
