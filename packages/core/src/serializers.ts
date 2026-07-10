import type { Recurrence, Todo } from '@askhumantowork/shared';
import type { todos, projects } from '@askhumantowork/db';

type TodoRow = typeof todos.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

export function serializeTodo(row: TodoRow, project?: Pick<ProjectRow, 'name'> | null): Todo {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: project?.name ?? null,
    title: row.title,
    notes: row.notes,
    dueAt: row.dueAt?.toISOString() ?? null,
    status: row.status,
    priority: row.priority,
    source: row.source,
    createdByAgent: row.createdByAgent,
    originContext: row.originContext,
    tags: row.tags,
    recurrence: (row.recurrence as Recurrence | null) ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
