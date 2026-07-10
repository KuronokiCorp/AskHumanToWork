import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { api } from '../api';
import { TOKEN_SCOPES } from '@askhumantowork/shared';
import { Button, Chip, EmptyState, PageHeader, SectionCard, inputCls } from '../components/ui';

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
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader
        title="API tokens"
        subtitle="Personal access tokens let AI agents (Claude Desktop, Claude Code, …) manage your todos via MCP."
      />

      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name, e.g. claude-desktop"
          className={inputCls}
        />
        <Button type="submit" className="shrink-0">
          Create token
        </Button>
      </form>

      {created && (
        <SectionCard tone="success" title="Token created — copy it now, it won't be shown again">
          <code className="block select-all break-all rounded-lg bg-white p-2.5 text-xs shadow-card">{created.token}</code>
          <div className="mt-3 text-[13px] font-semibold text-emerald-800">Claude Code:</div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2.5 text-xs shadow-card">
{`claude mcp add askhumantowork \\
  --env TODO_API_TOKEN=${created.token} \\
  --env TODO_API_URL=${location.protocol}//${location.hostname}:3000 \\
  -- npx -y askhumantowork-mcp`}
          </pre>
          <div className="mt-3 text-[13px] font-semibold text-emerald-800">Remote (Streamable HTTP):</div>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-2.5 text-xs shadow-card">
{`URL: ${location.protocol}//${location.hostname}:3000/mcp
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
