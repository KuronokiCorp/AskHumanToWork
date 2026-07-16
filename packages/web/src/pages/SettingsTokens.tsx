import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { api } from '../api';
import { TOKEN_SCOPES } from '@askhumantowork/shared';
import { Button, Chip, EmptyState, PageHeader, SectionCard, inputCls } from '../components/ui';

export default function SettingsTokens() {
  const qc = useQueryClient();
  const tokens = useQuery({ queryKey: ['tokens'], queryFn: api.tokens });
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState<string>(''); // '' = all projects (full access)
  const [created, setCreated] = useState<{ token: string; mcpConfig: unknown } | null>(null);

  const create = useMutation({
    mutationFn: () => api.createToken(name || 'my-agent', [...TOKEN_SCOPES], projectId || null),
    onSuccess: (data) => {
      setCreated(data);
      setName('');
      setProjectId('');
      void qc.invalidateQueries({ queryKey: ['tokens'] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteToken(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tokens'] }),
  });

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader
        title="API tokens"
        subtitle="Personal access tokens let AI agents (Claude Desktop, Claude Code, …) manage your todos via MCP."
      />

      <form
        className="mb-5 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name, e.g. claude-desktop"
          className={`${inputCls} min-w-[220px] flex-1`}
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className={`${inputCls} shrink-0`}
          title="Scope this token to a project (or leave as full access)"
        >
          <option value="">All projects (full access)</option>
          {(projects.data?.projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button type="submit" className="shrink-0">
          Create token
        </Button>
      </form>
      <p className="-mt-3 mb-5 text-xs text-zinc-400">
        Scoping a token to a project limits it to that project&apos;s todos plus ones it creates
        itself. Full-access tokens can see everything.
      </p>

      {created && (
        <SectionCard tone="success" title="Token created — copy it now, it won't be shown again">
          <code className="block select-all break-all rounded-lg bg-white p-2.5 text-xs shadow-card">{created.token}</code>
          <div className="mt-3 text-[13px] font-semibold text-emerald-800">Claude Code / Desktop (just a token — no local setup):</div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2.5 text-xs shadow-card">
{`claude mcp add heyhuman \\
  --env TODO_API_TOKEN=${created.token} \\
  -- npx -y heyhuman-mcp`}
          </pre>
          <div className="mt-3 text-[13px] font-semibold text-emerald-800">Remote (Streamable HTTP):</div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2.5 text-xs shadow-card">
{`URL: ${location.origin}/mcp
Header: Authorization: Bearer ${created.token}`}
          </pre>
        </SectionCard>
      )}

      <div className="flex flex-col gap-2">
        {tokens.data && tokens.data.tokens.length === 0 && (
          <EmptyState icon={<KeyRound size={22} />} title="No tokens yet" hint="Create one above to connect your first AI agent." />
        )}
        {(tokens.data?.tokens ?? []).map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 shadow-card"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
              <KeyRound size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {t.name}
                <Chip>{t.kind}</Chip>
                <Chip>{t.projectName ? `project: ${t.projectName}` : 'all projects'}</Chip>
              </div>
              <div className="mt-0.5 truncate text-xs text-zinc-400">
                {t.scopes.join(', ')} · last used {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : 'never'}
              </div>
            </div>
            <Button variant="danger" onClick={() => del.mutate(t.id)}>
              Revoke
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
