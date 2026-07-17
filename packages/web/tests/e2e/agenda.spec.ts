import { expect, test, type Page } from '@playwright/test';

/**
 * Logged-in agenda: calendar with due-day dots, Today-first sections,
 * click-through to detail, and the 15s auto-sync poll.
 * Each test signs up an isolated user (session cookie lands in the page's
 * context because page.request shares its cookie jar).
 */

const PASSWORD = 'e2e-password-123';

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function signup(page: Page): Promise<void> {
  const res = await page.request.post('/api/auth/signup', {
    data: { email: uniqueEmail(), password: PASSWORD, timezone: 'Asia/Tokyo' },
  });
  expect(res.ok()).toBeTruthy();
}

async function addTodo(page: Page, title: string, dueNatural?: string): Promise<void> {
  const res = await page.request.post('/api/todos', {
    data: dueNatural ? { title, dueNatural } : { title },
  });
  expect(res.status()).toBe(201);
}

/**
 * The month grid renders ghost cells from adjacent months: previous-month
 * days (25–31) come first, next-month days (1–8) last. Pick the in-month
 * cell for a day number accordingly.
 */
function dayCell(page: Page, day: number) {
  const cells = page
    .getByTestId('agenda-calendar')
    .getByRole('button', { name: String(day), exact: true });
  return day >= 20 ? cells.last() : cells.first();
}

test('agenda: calendar, Today on top, undated section', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Due later today', 'today 11:55pm');
  await addTodo(page, 'Captured without a date');

  await page.goto('/agenda');
  await expect(page.getByTestId('agenda-calendar')).toBeVisible({ timeout: 15_000 });
  // Section headers render as "Label·count" (flex gap, no text space).
  await expect(page.getByText(/^Today·/)).toBeVisible();
  await expect(page.getByText('Due later today').first()).toBeVisible();
  // Undated todos are no longer invisible — they get their own section.
  await expect(page.getByText(/No due date/)).toBeVisible();
  await expect(page.getByText('Captured without a date').first()).toBeVisible();
});

test('calendar: clicking a dotted day filters to its todos', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Tomorrow planning session', 'tomorrow 10am');

  await page.goto('/agenda');
  await expect(page.getByTestId('agenda-calendar')).toBeVisible({ timeout: 15_000 });

  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  await dayCell(page, tomorrow.getDate()).click();
  // The todo may show in both the selected-day and This-week sections.
  await expect(page.getByText('Tomorrow planning session').first()).toBeVisible();

  // Clear the day filter via its ×.
  await page.getByTitle('Clear day filter').click();
  await expect(page.getByTitle('Clear day filter')).toHaveCount(0);
});

test('todo click opens the detail page (due date editable there)', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Open me for details', 'today 11:50pm');

  await page.goto('/agenda');
  await expect(page.getByText('Open me for details')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: /Open me for details/ }).click();
  await page.waitForURL(/\/t\//);
  await expect(page.getByText('Open me for details')).toBeVisible();
  await expect(page.getByRole('button', { name: /Back/ })).toBeVisible();
});

test('auto-sync: a remotely created todo appears without a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await signup(page);

  await page.goto('/agenda');
  await expect(page.getByTestId('agenda-calendar')).toBeVisible({ timeout: 15_000 });

  // Simulate a remote agent: raw API call, no UI interaction, no reload.
  await addTodo(page, 'Synced from a remote agent', 'today 11:58pm');
  // The 15s poll must pick it up.
  await expect(page.getByText('Synced from a remote agent')).toBeVisible({ timeout: 25_000 });
});
