import type {
  Agenda,
  CreateTodoInput,
  ListTodosQuery,
  Project,
  Todo,
  UpdateTodoInput,
} from '@askhumantowork/shared';
import type { IntegrationInfo, SyncResult, TodoClient } from './client.js';

/**
 * REST-backed client used by the stdio binary: every MCP tool call becomes an
 * authenticated HTTP call to the AskHumanToWork API.
 */
export class RestTodoClient implements TodoClient {
  constructor(
    private apiUrl: string,
    private token: string,
    private agent: string,
    private webUrl: string,
  ) {}

  webBaseUrl() {
    return this.webUrl;
  }

  agentName() {
    return this.agent;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'X-Agent-Name': this.agent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = `${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) detail = data.error;
      } catch {
        /* keep status */
      }
      throw new Error(detail);
    }
    return res.json() as Promise<T>;
  }

  async addTodo(input: CreateTodoInput) {
    return this.call<{ todo: Todo; deduplicated: boolean; sync: SyncResult[] }>(
      'POST',
      '/api/todos',
      input,
    );
  }

  async listTodos(query: Partial<ListTodosQuery>): Promise<Todo[]> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      params.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const data = await this.call<{ todos: Todo[] }>('GET', `/api/todos?${params}`);
    return data.todos;
  }

  async getTodo(id: string): Promise<Todo> {
    return (await this.call<{ todo: Todo }>('GET', `/api/todos/${id}`)).todo;
  }

  async updateTodo(id: string, input: UpdateTodoInput): Promise<Todo> {
    return (await this.call<{ todo: Todo }>('PATCH', `/api/todos/${id}`, input)).todo;
  }

  async completeTodo(id: string): Promise<Todo> {
    return (await this.call<{ todo: Todo }>('POST', `/api/todos/${id}/complete`)).todo;
  }

  async getAgenda(): Promise<Agenda> {
    return this.call<Agenda>('GET', '/api/agenda');
  }

  async listProjects(): Promise<Project[]> {
    return (await this.call<{ projects: Project[] }>('GET', '/api/projects')).projects;
  }

  async listIntegrations(): Promise<IntegrationInfo[]> {
    const data = await this.call<{
      integrations: (IntegrationInfo & { config: unknown; lastSyncAt: string | null })[];
    }>('GET', '/api/integrations');
    return data.integrations.map((i) => ({
      provider: i.provider,
      displayName: i.displayName,
      status: i.status,
      capabilities: i.capabilities,
    }));
  }

  async resolveTime(text: string) {
    return this.call<{ iso: string; display: string; timezone: string } | null>(
      'POST',
      '/api/resolve-time',
      { text },
    );
  }
}
