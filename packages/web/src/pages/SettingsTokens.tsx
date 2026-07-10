import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { TOKEN_SCOPES } from '@askhumantowork/shared';

export default function SettingsTokens() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: api.tokens });
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ token: string; mcpConfig: unknown } | null>(null);

  const create = useMutation({
    mutationFn: () => api.createToken(name || 'my-agent', [...TOKEN_SCOPES]),
    onSuccess: (data) => {
      setCreated(data);
      setName('');
      void qc.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteToken(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-bold">API tokens</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Personal access tokens let AI agents (Claude Desktop, Claude Code, …) manage your todos via MCP.
      </p>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name, e.g. claude-desktop"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Create token
        </button>
      </form>

      {created && (
        <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
          <div className="mb-2 text-sm font-medium text-emerald-800">
            Token created — copy it now, it won't be shown again:
          </div>
          <code className="block select-all break-all rounded bg-white p-2 text-xs">{created.token}</code>
          <div className="mt-3 text-sm font-medium text-emerald-800">Claude Code (via npm):</div>
          <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs">
{`claude mcp add askhumantowork \\
  --env TODO_API_TOKEN=${created.token} \\
  --env TODO_API_URL=${location.protocol}//${location.hostname}:3000 \\
  -- npx -y askhumantowork-mcp`}
          </pre>
          <div className="mt-3 text-sm font-medium text-emerald-800">Remote (Streamable HTTP):</div>
          <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs">
{`URL: ${location.protocol}//${location.hostname}:3000/mcp
Header: Authorization: Bearer ${created.token}`}
          </pre>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(tokens.data?.tokens ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="flex-1">
              <div className="text-sm font-medium">
                {t.name}
                <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">{t.kind}</span>
              </div>
              <div className="text-xs text-zinc-400">
                {t.scopes.join(', ')} · last used{' '}
                {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'never'}
              </div>
            </div>
            <button onClick={() => del.mutate(t.id)} className="text-sm text-red-600 hover:underline">
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
