import { expect, test, type Page } from '@playwright/test';

/**
 * Phase-1 UI regen: /dashboard is the post-login home, todos grouped per
 * project (overdue-first), AI Inbox retired, AI provenance kept as a badge +
 * source filter, and the per-todo AI assistant surfaced with a visible header.
 * Spec: docs/specs/ui-regen-claude-code-and-project-dashboard.md.
 *
 * Each test signs up an isolated user; the session cookie rides page.request's
 * shared jar. Todos are seeded over the real API (same as agenda.spec.ts).
 */

const PASSWORD = 'e2e-password-123';

function uniqueEmail(): string {
  return `e2e-dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function signup(page: Page): Promise<void> {
  const res = await page.request.post('/api/auth/signup', {
    data: { email: uniqueEmail(), password: PASSWORD, timezone: 'Asia/Tokyo' },
  });
  expect(res.ok()).toBeTruthy();
}

type Seed = { project?: string; dueNatural?: string; ai?: string };

async function addTodo(page: Page, title: string, seed: Seed = {}): Promise<void> {
  const data: Record<string, unknown> = { title };
  if (seed.project) data.project = seed.project;
  if (seed.dueNatural) data.dueNatural = seed.dueNatural;
  if (seed.ai) data.originContext = 'captured in a chat';
  const res = await page.request.post('/api/todos', {
    // A session request can declare AI provenance via these headers — the same
    // path an MCP agent's token would take, but usable from the test session.
    headers: seed.ai ? { 'x-todo-source': 'ai', 'x-agent-name': seed.ai } : {},
    data,
  });
  expect(res.status()).toBe(201);
}

test('AC1: / lands on /dashboard; sidebar has no AI Inbox; /inbox-ai redirects', async ({ page }) => {
  await signup(page);

  await page.goto('/');
  await page.waitForURL(/\/dashboard$/);

  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'Agenda' })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: 'All todos' })).toBeVisible();
  await expect(sidebar.getByText('AI Inbox')).toHaveCount(0);

  await page.goto('/inbox-ai');
  await page.waitForURL(/\/dashboard$/);
});

test('AC2: dashboard groups todos per project + No project, overdue group sorts first', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Alpha overdue task', { project: 'Alpha', dueNatural: 'yesterday 9am' });
  await addTodo(page, 'Alpha future task', { project: 'Alpha', dueNatural: 'next week' });
  await addTodo(page, 'Beta only task', { project: 'Beta', dueNatural: 'next week' });
  await addTodo(page, 'Ungrouped task');

  await page.goto('/dashboard');

  const groups = page.getByTestId('dashboard-group');
  await expect(groups).toHaveCount(3);

  // Alpha carries the only overdue item, so its group sorts first and shows the count.
  // exact:true so the header link isn't confused with todo-title links ("Alpha overdue task").
  const first = groups.first();
  await expect(first.getByRole('link', { name: 'Alpha', exact: true })).toBeVisible();
  await expect(first.getByText('2 open')).toBeVisible();
  await expect(first.getByText('1 overdue')).toBeVisible();

  // A "No project" group exists for the ungrouped todo.
  await expect(page.getByRole('link', { name: 'No project', exact: true })).toBeVisible();
  await expect(page.getByText('Ungrouped task')).toBeVisible();
});

test('AC3: AI todo shows agent badge on dashboard + all todos; source filter narrows', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Agent captured this', { project: 'Gamma', ai: 'heyhuman' });
  await addTodo(page, 'I typed this myself', { project: 'Gamma' });

  await page.goto('/dashboard');
  await expect(page.getByText('Agent captured this')).toBeVisible();
  await expect(page.getByText('heyhuman').first()).toBeVisible();

  await page.goto('/all');
  await expect(page.getByText('Agent captured this')).toBeVisible();
  await expect(page.getByText('I typed this myself')).toBeVisible();

  const filter = page.getByTestId('source-filter');
  await filter.getByRole('button', { name: 'AI' }).click();
  await expect(page.getByText('Agent captured this')).toBeVisible();
  await expect(page.getByText('I typed this myself')).toHaveCount(0);

  await filter.getByRole('button', { name: 'Human' }).click();
  await expect(page.getByText('I typed this myself')).toBeVisible();
  await expect(page.getByText('Agent captured this')).toHaveCount(0);
});

test('AC4: group header opens project view; row opens detail with AI assistant header', async ({ page }) => {
  await signup(page);
  await addTodo(page, 'Delta task one', { project: 'Delta', dueNatural: 'next week' });

  await page.goto('/dashboard');
  // Scope to the dashboard group header (the sidebar also lists a "Delta" project link).
  await page.getByTestId('dashboard-group').getByRole('link', { name: 'Delta', exact: true }).click();
  await page.waitForURL(/\/project\/Delta$/);
  await expect(page.getByRole('heading', { name: '#Delta' })).toBeVisible();

  await page.getByRole('link', { name: /Delta task one/ }).first().click();
  await page.waitForURL(/\/t\//);
  await expect(page.getByRole('heading', { name: 'AI assistant' })).toBeVisible();
});
