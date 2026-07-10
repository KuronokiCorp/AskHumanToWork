import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Todo } from '@askhumantowork/shared';
import type { TodoClient } from './client.js';

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true as const };
}

/** Compact wire form so agents can reason over lists cheaply. */
function compact(t: Todo) {
  return {
    id: t.id,
    title: t.title,
    due: t.dueAt,
    status: t.status,
    priority: t.priority,
    project: t.projectName,
    tags: t.tags.length ? t.tags : undefined,
    source: t.source === 'ai' ? `ai (${t.createdByAgent ?? 'unknown'})` : 'human',
    originContext: t.originContext ?? undefined,
  };
}

async function run(fn: () => Promise<{ content: { type: 'text'; text: string }[] }>) {
  try {
    return await fn();
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export function createTodoMcpServer(client: TodoClient): McpServer {
  const server = new McpServer({ name: 'askhumantowork', version: '0.1.0' });

  // ---------- Tools ----------

  server.tool(
    'add_todo',
    'Add a todo to the user\'s list. Use this whenever the user should remember to do something later, ' +
      'or when you commit to a follow-up on their behalf. ALWAYS set a due date if one is stated or implied ' +
      '(prefer due_natural — the server resolves it in the user\'s timezone, never do date math yourself). ' +
      'ALWAYS fill origin_context with one sentence on WHY this todo exists so the user remembers the context ' +
      'when reminded. The call is idempotent within 10 minutes (same title+due+project returns the existing todo).',
    {
      title: z.string().max(200).describe('Short imperative title, e.g. "Deploy payments-service v2"'),
      notes: z.string().max(10_000).optional().describe('Longer details, links, checklists'),
      due_natural: z
        .string()
        .max(120)
        .optional()
        .describe('Due date in natural language, e.g. "friday 5pm", "in 3 days", "tomorrow morning". Preferred over due_at.'),
      due_at: z.string().optional().describe('Absolute ISO 8601 due date. Only if you already have an exact instant.'),
      project: z.string().max(100).optional().describe('Project name; fuzzy-matched to existing projects, created if new'),
      priority: z.number().int().min(0).max(3).optional().describe('0=none 1=low 2=medium 3=high'),
      tags: z.array(z.string().max(50)).max(20).optional(),
      reminders: z.array(z.string()).max(10).optional()
        .describe('Explicit reminder times (natural language or ISO). Omit for sensible defaults derived from the due date (1 day before, 1 hour before, at due, then daily overdue nudges).'),
      origin_context: z.string().max(500).optional()
        .describe('One sentence on WHY this todo exists, e.g. "You asked me to remind you after we found the flaky test." Strongly recommended.'),
      sync_to: z.array(z.enum(['ms-todo', 'google-tasks'])).optional()
        .describe('Override which connected external apps mirror this todo. Omit to use the user\'s routing rules. Check list_integrations for what is connected.'),
    },
    async (args) =>
      run(async () => {
        const result = await client.addTodo({
          title: args.title,
          notes: args.notes,
          dueNatural: args.due_natural,
          dueAt: args.due_at,
          project: args.project,
          priority: args.priority as 0 | 1 | 2 | 3 | undefined,
          tags: args.tags,
          reminders: args.reminders,
          originContext: args.origin_context,
          syncTo: args.sync_to,
        });
        return ok({
          ...(result.deduplicated ? { note: 'Identical todo was created moments ago — returning it instead of duplicating.' } : {}),
          todo: compact(result.todo),
          link: `${client.webBaseUrl()}/t/${result.todo.id}`,
          sync: result.sync,
        });
      }),
  );

  server.tool(
    'list_todos',
    'List the user\'s todos with filters. Use get_agenda instead for a "what\'s on my plate" overview.',
    {
      status: z.enum(['open', 'doing', 'done', 'cancelled']).optional().describe('Default: all statuses'),
      project: z.string().optional(),
      due_before: z.string().optional().describe('ISO date — only todos due before this'),
      overdue: z.boolean().optional().describe('Only overdue open todos'),
      tags: z.array(z.string()).optional(),
      source: z.enum(['human', 'ai']).optional().describe('Filter by who created the todo'),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async (args) =>
      run(async () => {
        const todos = await client.listTodos({
          status: args.status,
          project: args.project,
          dueBefore: args.due_before,
          overdue: args.overdue,
          tags: args.tags,
          source: args.source,
          limit: args.limit ?? 50,
          offset: 0,
        });
        return ok({ count: todos.length, todos: todos.map(compact) });
      }),
  );

  server.tool(
    'search_todos',
    'Full-text search over todo titles and notes. Use when looking for a specific todo by content.',
    { query: z.string().min(1), limit: z.number().int().min(1).max(100).optional() },
    async (args) =>
      run(async () => {
        const todos = await client.listTodos({ search: args.query, limit: args.limit ?? 20, offset: 0 });
        return ok({ count: todos.length, todos: todos.map(compact) });
      }),
  );

  server.tool(
    'update_todo',
    'Update a todo\'s fields (title, notes, due date, project, priority, tags, status). ' +
      'For marking done use complete_todo; for changing only the due date use reschedule_todo.',
    {
      id: z.string().describe('Todo id (from add_todo/list_todos/search_todos)'),
      title: z.string().max(200).optional(),
      notes: z.string().max(10_000).optional(),
      due_natural: z.string().max(120).optional().describe('New due date in natural language'),
      clear_due: z.boolean().optional().describe('Remove the due date entirely'),
      project: z.string().max(100).optional(),
      priority: z.number().int().min(0).max(3).optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(['open', 'doing', 'done', 'cancelled']).optional(),
    },
    async (args) =>
      run(async () => {
        const todo = await client.updateTodo(args.id, {
          title: args.title,
          notes: args.notes,
          dueNatural: args.due_natural,
          dueAt: args.clear_due ? null : undefined,
          project: args.project,
          priority: args.priority as 0 | 1 | 2 | 3 | undefined,
          tags: args.tags,
          status: args.status,
        });
        return ok({ todo: compact(todo) });
      }),
  );

  server.tool(
    'complete_todo',
    'Mark a todo as done. Cancels its pending reminders and mirrors completion to connected apps.',
    { id: z.string() },
    async (args) =>
      run(async () => {
        const todo = await client.completeTodo(args.id);
        return ok({ todo: compact(todo), note: 'Completed. Reminders cancelled.' });
      }),
  );

  server.tool(
    'reschedule_todo',
    'Move a todo\'s due date. Reminders are recomputed automatically from the new date.',
    {
      id: z.string(),
      due_natural: z.string().max(120).describe('New due date in natural language, e.g. "next tuesday 3pm"'),
    },
    async (args) =>
      run(async () => {
        const todo = await client.updateTodo(args.id, { dueNatural: args.due_natural });
        return ok({ todo: compact(todo) });
      }),
  );

  server.tool(
    'get_agenda',
    'The user\'s current agenda: overdue, due today, and next 7 days, in their timezone. ' +
      'Call this at the START of a session to proactively surface what needs attention.',
    {},
    async () =>
      run(async () => {
        const agenda = await client.getAgenda();
        return ok({
          date: agenda.date,
          timezone: agenda.timezone,
          summary: agenda.summary,
          overdue: agenda.overdue.map(compact),
          today: agenda.today.map(compact),
          upcoming: agenda.upcoming.map(compact),
        });
      }),
  );

  server.tool(
    'list_projects',
    'List the user\'s projects (for matching a todo to the right project).',
    {},
    async () => run(async () => ok({ projects: await client.listProjects() })),
  );

  server.tool(
    'list_integrations',
    'Which external todo apps (Microsoft To Do, Google Tasks, …) are connected, and their capabilities. ' +
      'Use before sync_to, or to answer "put this in my Microsoft list".',
    {},
    async () => run(async () => ok({ integrations: await client.listIntegrations() })),
  );

  server.tool(
    'resolve_time',
    'Resolve a natural-language time ("next tuesday 3pm") to an absolute instant in the user\'s timezone. ' +
      'Usually unnecessary — add_todo/reschedule_todo accept due_natural directly.',
    { text: z.string().max(120) },
    async (args) =>
      run(async () => {
        const resolved = await client.resolveTime(args.text);
        return resolved ? ok(resolved) : fail(`could not parse "${args.text}"`);
      }),
  );

  // ---------- Resources ----------

  server.resource('agenda-today', 'todo://agenda/today', async (uri) => {
    const agenda = await client.getAgenda();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ summary: agenda.summary, overdue: agenda.overdue.map(compact), today: agenda.today.map(compact) }, null, 2),
        },
      ],
    };
  });

  server.resource('agenda-overdue', 'todo://agenda/overdue', async (uri) => {
    const agenda = await client.getAgenda();
    return {
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(agenda.overdue.map(compact), null, 2) },
      ],
    };
  });

  server.resource('projects', 'todo://projects', async (uri) => {
    const projects = await client.listProjects();
    return {
      contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(projects, null, 2) }],
    };
  });

  // ---------- Prompts ----------

  server.prompt(
    'capture-followups',
    'Scan the conversation so far and capture every commitment or follow-up as todos.',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Review our conversation so far and identify every commitment, follow-up, or action item ' +
              'that I (the user) should do later — things I said I would do, things you recommended I do, ' +
              'and unresolved threads. For each one, call add_todo with a clear title, a due date if one was ' +
              'stated or reasonably implied (due_natural), the right project, and origin_context explaining ' +
              'where in our conversation it came from. Then show me a short list of what you captured.',
          },
        },
      ],
    }),
  );

  server.prompt(
    'review-my-todos',
    'Fetch the agenda and help the user triage: complete, reschedule, or drop.',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Call get_agenda, then walk me through my overdue and due-today items one by one. ' +
              'For each, ask whether I have done it (then complete_todo), want to reschedule ' +
              '(then reschedule_todo), or want to drop it (then update_todo status=cancelled). ' +
              'Be brief; group obviously related items.',
          },
        },
      ],
    }),
  );

  return server;
}
