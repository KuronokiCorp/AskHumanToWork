import { asc, eq, and } from 'drizzle-orm';
import { aiUsageEvents, projects, todoMessages, todos } from '@askhumantowork/db';
import type { ChatUsage, TodoMessage } from '@askhumantowork/shared';
import type { AppContext } from './context.js';
import { UserFacingError } from './todo-service.js';
import type { TokenProjectScope } from './todo-service.js';
import { applyMarkup, canSpend, periodTotals, splitAgainstAllowance } from './ai-usage.js';

/** How many prior turns to replay as context. Keeps cost bounded on long threads. */
const HISTORY_LIMIT = 20;

export interface ChatModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletion {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Our raw provider cost for this call, in micro-USD. */
  costMicros: number;
}

/**
 * The model behind the per-todo assistant. Kept as an interface so the
 * provider is swappable and the service can be tested without a network call.
 */
export interface ChatModelClient {
  complete(req: { system: string; messages: ChatModelMessage[] }): Promise<ChatCompletion>;
}

type MessageRow = typeof todoMessages.$inferSelect;

function serializeMessage(row: MessageRow): TodoMessage {
  return {
    id: row.id,
    todoId: row.todoId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Per-todo AI assistant: a conversation scoped to one todo, with the todo's
 * own fields as standing context so the user never has to restate them.
 */
export class TodoChatService {
  constructor(
    private ctx: AppContext,
    private model: ChatModelClient,
  ) {}

  /** Ownership check + the fields we feed the model as context. */
  private async loadTodo(userId: string, todoId: string, scope?: TokenProjectScope | null) {
    const rows = await this.ctx.db
      .select({ todo: todos, projectName: projects.name })
      .from(todos)
      .leftJoin(projects, eq(todos.projectId, projects.id))
      .where(and(eq(todos.id, todoId), eq(todos.ownerId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new UserFacingError('todo not found');
    // Project-scoped tokens may only chat about todos they can already see.
    if (scope && row.todo.projectId !== scope.projectId && row.todo.createdByToken !== scope.tokenName) {
      throw new UserFacingError('todo not found');
    }
    return row;
  }

  async list(
    userId: string,
    todoId: string,
    scope?: TokenProjectScope | null,
  ): Promise<TodoMessage[]> {
    await this.loadTodo(userId, todoId, scope);
    const rows = await this.ctx.db
      .select()
      .from(todoMessages)
      .where(eq(todoMessages.todoId, todoId))
      .orderBy(asc(todoMessages.createdAt));
    return rows.map(serializeMessage);
  }

  /**
   * Send one user turn and get the assistant's reply.
   *
   * Spend is checked *before* the call (so an exhausted user is refused
   * cheaply) and recorded *after* it, against the allowance as it stood at
   * that moment.
   */
  async send(
    userId: string,
    todoId: string,
    content: string,
    scope?: TokenProjectScope | null,
  ): Promise<{ message: TodoMessage; usage: ChatUsage }> {
    const { todo, projectName } = await this.loadTodo(userId, todoId, scope);

    const spend = await canSpend(this.ctx, userId);
    if (!spend.allowed) throw new UserFacingError(spend.reason ?? 'AI allowance exhausted');

    const history = await this.ctx.db
      .select()
      .from(todoMessages)
      .where(eq(todoMessages.todoId, todoId))
      .orderBy(asc(todoMessages.createdAt));

    await this.ctx.db
      .insert(todoMessages)
      .values({ todoId, ownerId: userId, role: 'user', content });

    const completion = await this.model.complete({
      system: buildSystemPrompt(todo, projectName),
      messages: [
        ...history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content },
      ],
    });

    const [assistantRow] = await this.ctx.db
      .insert(todoMessages)
      .values({ todoId, ownerId: userId, role: 'assistant', content: completion.content })
      .returning();

    const usage = await this.recordUsage(userId, todoId, completion);
    return { message: serializeMessage(assistantRow!), usage };
  }

  /** Price the call, split it against the free allowance, and ledger it. */
  private async recordUsage(
    userId: string,
    todoId: string,
    completion: ChatCompletion,
  ): Promise<ChatUsage> {
    const priceMicros = applyMarkup(completion.costMicros);
    const { usedMicros } = await periodTotals(this.ctx, userId);
    const { billedMicros } = splitAgainstAllowance(priceMicros, usedMicros);

    await this.ctx.db.insert(aiUsageEvents).values({
      ownerId: userId,
      todoId,
      model: completion.model,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      costMicros: completion.costMicros,
      priceMicros,
      billedMicros,
      // Overage is reported to Stripe by the billing worker, not inline —
      // a Stripe outage must not fail the user's message.
      reportedToStripe: billedMicros === 0,
    });

    return {
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
      priceMicros,
      billedMicros,
    };
  }
}

type TodoRow = typeof todos.$inferSelect;

/** Standing context so the user can say "when is this due?" without restating it. */
function buildSystemPrompt(todo: TodoRow, projectName: string | null): string {
  const facts = [
    `Title: ${todo.title}`,
    `Status: ${todo.status}`,
    todo.blockedReason ? `Blocked because: ${todo.blockedReason}` : null,
    projectName ? `Project: ${projectName}` : null,
    todo.dueAt ? `Due: ${todo.dueAt.toISOString()}` : 'Due: not scheduled',
    todo.priority ? `Priority: ${['none', 'low', 'medium', 'high'][todo.priority]}` : null,
    todo.tags?.length ? `Tags: ${(todo.tags as string[]).join(', ')}` : null,
    todo.notes ? `Notes: ${todo.notes}` : null,
  ].filter(Boolean);

  return [
    'You are a focused assistant helping the user make progress on one specific task.',
    'Be concrete and brief — a few sentences, or a short list when steps genuinely help.',
    'You cannot modify the task; if the user asks you to, tell them which field to change.',
    '',
    'The task:',
    ...facts,
  ].join('\n');
}
