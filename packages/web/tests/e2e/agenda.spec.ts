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
 * cell for a day number accordingly. Cells contain entry titles too, so we
 * locate them by their date-number span, not by accessible name.
 */
function dayCell(page: Page, day: number) {
  const cells = page
    .getByTestId('agenda-calendar')
    .locator('[role="button"]', { has: page.locator(`span:text-is("${day}")`) });
  return day >= 20 ? cells.last() : cells.first();
}

test('agenda: calendar with visible titles, Today on top, undated section', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Due later today', 'today 11:55pm');
  await addTodo(page, 'Captured without a date');

  await page.goto('/agenda');
  await expect(page.getByTestId('agenda-calendar')).toBeVisible({ timeout: 15_000 });
  // The big calendar shows the todo's title inside today's day cell.
  await expect(
    page.getByTestId('agenda-calendar').getByText('Due later today'),
  ).toBeVisible();
  await expect(page.getByText(/^Today — /)).toBeVisible();
  // Undated todos are no longer invisible — they get their own section.
  await expect(page.getByText(/No due date/)).toBeVisible();
  await expect(page.getByText('Captured without a date').first()).toBeVisible();
});

test('calendar: clicking a day shows its todos below', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Tomorrow planning session', 'tomorrow 10am');

  await page.goto('/agenda');
  await expect(page.getByTestId('agenda-calendar')).toBeVisible({ timeout: 15_000 });

  const tomorrow = new Date(Date.now() + 24 * 3_600_000);
  // Click the cell's padding (top-left corner), not the entry link inside it.
  await dayCell(page, tomorrow.getDate()).click({ position: { x: 4, y: 4 } });
  // The todo shows both as a calendar entry and in the selected-day section.
  await expect(page.getByText('Tomorrow planning session').first()).toBeVisible();

  // Clear the day filter via its ×.
  await page.getByTitle('Clear day filter').click();
  await expect(page.getByTitle('Clear day filter')).toHaveCount(0);
});

test('todo click opens the detail page (due date editable there)', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Open me for details', 'today 11:50pm');

  await page.goto('/agenda');
  await expect(page.getByText('Open me for details').first()).toBeVisible({ timeout: 15_000 });
  // Title appears both as a calendar entry and in the Today section — either opens the detail.
  await page.getByRole('link', { name: /Open me for details/ }).first().click();
  await page.waitForURL(/\/t\//);
  await expect(page.getByText('Open me for details').first()).toBeVisible();
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
  await expect(page.getByText('Synced from a remote agent').first()).toBeVisible({ timeout: 25_000 });
});
