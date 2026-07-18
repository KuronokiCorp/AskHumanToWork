import type {
  Agenda,
  Briefing,
  CreateTodoInput,
  ListTodosQuery,
  Project,
  Todo,
  UpdateTodoInput,
} from '@askhumantowork/shared';

export interface SyncResult {
  provider: string;
  status: 'queued' | 'skipped';
}

export interface IntegrationInfo {
  provider: string;
  displayName: string;
  status: string;
  capabilities: Record<string, boolean>;
}

/**
 * Backend abstraction the MCP tools talk to. Two implementations:
 *  - RestTodoClient (stdio binary → remote REST API with a PAT)
 *  - CoreTodoClient (in-process, used by the /mcp HTTP transport in the API server)
 * Keeping tools transport-agnostic means one source of truth for the MCP surface.
 */
export interface TodoClient {
  webBaseUrl(): string;
  agentName(): string;
  addTodo(input: CreateTodoInput): Promise<{ todo: Todo; deduplicated: boolean; sync: SyncResult[] }>;
  listTodos(query: Partial<ListTodosQuery>): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo>;
  updateTodo(id: string, input: UpdateTodoInput): Promise<Todo>;
  completeTodo(id: string): Promise<Todo>;
  getAgenda(): Promise<Agenda>;
  getBriefing(): Promise<Briefing>;
  listProjects(): Promise<Project[]>;
  listIntegrations(): Promise<IntegrationInfo[]>;
  resolveTime(text: string): Promise<{ iso: string; display: string; timezone: string } | null>;
}
