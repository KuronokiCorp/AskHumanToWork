import { expect, test, type Page } from '@playwright/test';

/**
 * Per-todo AI assistant, driven against the local MiniMax stub (see
 * playwright.config.ts). Covers the things only the browser can prove:
 * the reply renders as markdown rather than raw asterisks, the turn is
 * persisted across a reload, and a failed call leaves no orphaned message.
 */

const PASSWORD = 'e2e-password-123';

function uniqueEmail(): string {
  return `e2e-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

async function signup(page: Page): Promise<void> {
  const res = await page.request.post('/api/auth/signup', {
    data: { email: uniqueEmail(), password: PASSWORD, timezone: 'Asia/Tokyo' },
  });
  expect(res.ok()).toBeTruthy();
}

/** Create a todo and open its detail page. */
async function openTodo(page: Page, title: string): Promise<string> {
  const res = await page.request.post('/api/todos', { data: { title } });
  expect(res.status()).toBe(201);
  const { todo } = (await res.json()) as { todo: { id: string } };
  await page.goto(`/t/${todo.id}`);
  await expect(page.getByText('Ask about this task')).toBeVisible({ timeout: 15_000 });
  return todo.id;
}

const composer = (page: Page) => page.getByPlaceholder('Ask about this task…');

test('assistant reply renders as markdown, not raw asterisks', async ({ page }) => {
  await signup(page);
  await openTodo(page, 'Write the quarterly report');

  await composer(page).fill('How should I start?');
  await page.getByRole('button', { name: /Send/ }).click();

  // The stub replies with a numbered list containing bold runs.
  await expect(page.getByText('Draft the outline')).toBeVisible({ timeout: 15_000 });
  // Rendered: real <strong> and <li>, and no literal ** left on the page.
  await expect(page.locator('.chat-md strong').first()).toBeVisible();
  await expect(page.locator('.chat-md ol li')).toHaveCount(2);
  await expect(page.getByText('**Draft the outline**')).toHaveCount(0);
});

test('the exchange survives a reload, and usage is reported', async ({ page }) => {
  await signup(page);
  const id = await openTodo(page, 'Plan the migration');

  await composer(page).fill('What comes first?');
  await page.getByRole('button', { name: /Send/ }).click();
  await expect(page.getByText('Draft the outline')).toBeVisible({ timeout: 15_000 });

  // Cost footer for the turn just sent.
  await expect(page.getByText(/tokens ·/)).toBeVisible();
  await expect(page.getByText(/free allowance/)).toBeVisible();

  // Persisted server-side, not just held in component state.
  await page.goto(`/t/${id}`);
  await expect(page.getByText('What comes first?')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Draft the outline')).toBeVisible();
});

test('a failed call surfaces an error and leaves no orphaned turn', async ({ page }) => {
  await signup(page);
  const id = await openTodo(page, 'Handle upstream failure');

  // __FAIL__ makes the stub answer the way MiniMax reports a bad key:
  // HTTP 200 with a non-zero base_resp.status_code.
  await composer(page).fill('__FAIL__ please break');
  await page.getByRole('button', { name: /Send/ }).click();

  await expect(page.getByText(/temporarily unavailable/i)).toBeVisible({ timeout: 15_000 });

  // The user's turn must not persist — otherwise it renders with no reply and
  // is replayed as context on every later turn.
  await page.goto(`/t/${id}`);
  await expect(page.getByText('Ask about this task')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('please break')).toHaveCount(0);
});

test('the suggest button opens the thread without typing', async ({ page }) => {
  await signup(page);
  await openTodo(page, 'Ship the release');

  // Opening the todo must not call the model — the opener is a click, so that
  // merely browsing a todo never bills anything.
  await expect(page.getByText(/tokens ·/)).toHaveCount(0);

  const suggest = page.getByRole('button', { name: /Suggest how to tackle this/ });
  await expect(suggest).toBeVisible();
  await suggest.click();

  await expect(page.getByText('Draft the outline')).toBeVisible({ timeout: 15_000 });
  // Sent as an ordinary user turn, so it shows in the thread...
  await expect(page.getByText(/How should I approach this\?/)).toBeVisible();
  // ...and the empty-state opener is gone once the thread has messages.
  await expect(suggest).toHaveCount(0);
});

test('each todo keeps its own thread', async ({ page }) => {
  await signup(page);
  await openTodo(page, 'First task');

  await composer(page).fill('Only on the first task');
  await page.getByRole('button', { name: /Send/ }).click();
  await expect(page.getByText('Draft the outline')).toBeVisible({ timeout: 15_000 });

  await openTodo(page, 'Second task');
  await expect(page.getByText('Only on the first task')).toHaveCount(0);
});
