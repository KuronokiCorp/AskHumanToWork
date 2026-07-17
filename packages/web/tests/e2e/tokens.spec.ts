import { expect, test, type Page } from '@playwright/test';

/**
 * Token scope selector: Admin (full access) · pick an existing project ·
 * "+ New project…" created inline and the token scoped to it.
 */

async function signup(page: Page): Promise<void> {
  const res = await page.request.post('/api/auth/signup', {
    data: {
      email: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`,
      password: 'e2e-password-123',
      timezone: 'Asia/Tokyo',
    },
  });
  expect(res.ok()).toBeTruthy();
}

test('create a token scoped to an inline-created project', async ({ page }) => {
  await signup(page);
  await page.goto('/settings/tokens');
  await page.getByPlaceholder('Token name, e.g. claude-desktop').fill('e2e scoped token');

  // "+ New project…" reveals the name input; the token binds to the new project.
  await page.locator('select').selectOption('__new__');
  await page.getByPlaceholder('New project name').fill('E2E Scope');
  await page.getByRole('button', { name: 'Create token' }).click();

  await expect(page.getByText(/Token created/)).toBeVisible({ timeout: 10_000 });
  const row = page.locator('div', { hasText: 'e2e scoped token' }).getByText('project: E2E Scope');
  await expect(row.first()).toBeVisible();
  // The new project also lands in the picker for next time.
  await expect(page.locator('select option', { hasText: 'E2E Scope' })).toHaveCount(1);
});

test('default scope is Admin — full access', async ({ page }) => {
  await signup(page);
  await page.goto('/settings/tokens');
  await expect(page.locator('select')).toHaveValue('');
  await page.getByPlaceholder('Token name, e.g. claude-desktop').fill('e2e admin token');
  await page.getByRole('button', { name: 'Create token' }).click();

  await expect(page.getByText(/Token created/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('admin', { exact: true }).first()).toBeVisible();
});
