import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plug, Sparkles } from 'lucide-react';
import { api, type IntegrationRow } from '../api';
import { Button, Chip, EmptyState, PageHeader, SectionCard } from '../components/ui';

const capabilityGapNotes: Record<string, string> = {
  'google-tasks':
    'Google Tasks supports date-only due dates (no time) and has no priorities or reminders — AskHumanToWork stays your reminder engine.',
  'ms-todo': 'Microsoft To Do supports due times, reminders and importance.',
};

const selectCls =
  'rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-sm shadow-card outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10';

export default function SettingsIntegrations() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ['integrations'], queryFn: api.integrations });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['integrations'] });

  const connected = data.data?.integrations ?? [];
  const connectedProviders = new Set(connected.map((i) => i.provider));
  const available = (data.data?.availableProviders ?? []).filter(
    (p) => !connectedProviders.has(p.provider),
  );
  const isPro = data.data?.integrationsEnabled ?? false;

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader
        title="Integrations"
        badge={<Chip tone="amber">PRO</Chip>}
        subtitle="Mirror your todos into apps you already use. AskHumanToWork stays the source of truth — and the thing that reminds you."
      />

      {!isPro && !data.isLoading && (
        <SectionCard
          tone="warn"
          title={
            <span className="flex items-center gap-1.5 text-amber-800">
              <Sparkles size={15} /> Third-party sync is a Pro feature
            </span>
          }
          description="Upgrade to mirror your todos into Microsoft To Do, Google Tasks and more — with two-way completion sync. Everything else (AI capture via MCP, reminders, web & mobile) stays free forever."
        >
          <div className="flex items-center gap-3">
            <Button
              className="!from-amber-500 !to-amber-600 hover:!from-amber-400"
              title="Billing checkout coming soon — an admin can enable Pro from the Admin page"
            >
              Upgrade to Pro
            </Button>
            <span className="text-xs text-amber-600">billing coming soon — admins can enable Pro per user on the Admin page</span>
          </div>
        </SectionCard>
      )}

      {connected.map((integ) => (
        <IntegrationCard key={integ.id} integ={integ} onChange={invalidate} />
      ))}

      {available.length > 0 && (
        <>
          <div className="mb-2 mt-7 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
            Available
          </div>
          {available.map((p) => (
            <div
              key={p.provider}
              className="mb-2 flex items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 shadow-card"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
                <Plug size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.displayName}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-zinc-400">{capabilityGapNotes[p.provider]}</div>
              </div>
              {isPro ? (
                <a
                  href={`/api/integrations/${p.provider}/connect`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-violet-600 to-violet-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-violet-500 active:scale-[0.98]"
                >
                  Connect
                </a>
              ) : (
                <Chip tone="zinc">
                  <Lock size={11} /> Pro
                </Chip>
              )}
            </div>
          ))}
        </>
      )}

      {connected.length === 0 && available.length === 0 && !data.isLoading && (
        <EmptyState
          icon={<Plug size={22} />}
          title="No providers configured yet"
          hint="An admin needs to add OAuth app credentials (Admin settings or env vars MS_TODO_CLIENT_ID/SECRET, GOOGLE_TASKS_CLIENT_ID/SECRET)."
        />
      )}
    </div>
  );
}

function IntegrationCard({ integ, onChange }: { integ: IntegrationRow; onChange: () => void }) {
  const lists = useQuery({
    queryKey: ['integration-lists', integ.id],
    queryFn: () => api.integrationLists(integ.id),
    enabled: integ.status === 'active',
  });
  const update = useMutation({
    mutationFn: (config: Record<string, unknown>) => api.updateIntegration(integ.id, config),
    onSuccess: onChange,
  });
  const disconnect = useMutation({
    mutationFn: () => api.disconnectIntegration(integ.id),
    onSuccess: onChange,
  });
  const resync = useMutation({ mutationFn: () => api.resyncIntegration(integ.id) });

  return (
    <SectionCard>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            {integ.displayName}
            <Chip tone={integ.status === 'active' ? 'emerald' : 'red'}>{integ.status}</Chip>
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-zinc-400">
            {capabilityGapNotes[integ.provider]} · Last sync:{' '}
            {integ.lastSyncAt ? new Date(integ.lastSyncAt).toLocaleString() : 'never'}
          </div>
          {integ.lastError && <div className="mt-1 text-xs text-red-600">⚠ {integ.lastError}</div>}
        </div>
        <Button variant="secondary" onClick={() => resync.mutate()}>
          {resync.isPending ? 'Re-syncing…' : 'Force re-sync'}
        </Button>
        <Button variant="danger" onClick={() => disconnect.mutate()}>
          Disconnect
        </Button>
      </div>

      {integ.status === 'active' && (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Target list</span>
            <select
              value={integ.config.defaultListId ?? ''}
              onChange={(e) => {
                const list = lists.data?.lists.find((l) => l.id === e.target.value);
                update.mutate({ defaultListId: e.target.value, defaultListName: list?.name });
              }}
              className={selectCls}
            >
              <option value="">Default list</option>
              {(lists.data?.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Direction</span>
            <select
              value={integ.config.direction ?? 'two-way'}
              onChange={(e) => update.mutate({ direction: e.target.value })}
              className={selectCls}
            >
              <option value="two-way">Two-way (completion syncs back)</option>
              <option value="outbound">Outbound only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Only sync</span>
            <select
              value={integ.config.filters?.sourceOnly ?? ''}
              onChange={(e) =>
                update.mutate({ filters: { ...integ.config.filters, sourceOnly: e.target.value || undefined } })
              }
              className={selectCls}
            >
              <option value="">All todos</option>
              <option value="ai">AI-created only</option>
              <option value="human">Human-created only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Minimum priority</span>
            <select
              value={integ.config.filters?.minPriority ?? 0}
              onChange={(e) =>
                update.mutate({
                  filters: { ...integ.config.filters, minPriority: Number(e.target.value) || undefined },
                })
              }
              className={selectCls}
            >
              <option value={0}>Any</option>
              <option value={1}>Low+</option>
              <option value={2}>Medium+</option>
              <option value={3}>High only</option>
            </select>
          </label>
        </div>
      )}
    </SectionCard>
  );
}
