import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type IntegrationRow } from '../api';

const capabilityGapNotes: Record<string, string> = {
  'google-tasks':
    'Google Tasks supports date-only due dates (no time) and has no priorities or reminders — AskHumanToWork stays your reminder engine.',
  'ms-todo': 'Microsoft To Do supports due times, reminders and importance.',
};

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
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        Integrations
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          PRO
        </span>
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        Mirror your todos into apps you already use. AskHumanToWork stays the source of truth — and the
        thing that reminds you.
      </p>

      {!isPro && !data.isLoading && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-800">
            ⭐ Third-party sync is a Pro feature
          </div>
          <p className="mt-1 text-sm text-amber-700">
            Upgrade to mirror your todos into Microsoft To Do, Google Tasks and more — with two-way
            completion sync. Everything else (AI capture via MCP, reminders, web &amp; mobile) stays
            free forever.
          </p>
          <button
            className="mt-3 cursor-not-allowed rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white opacity-90"
            title="Billing checkout coming soon — an admin can enable Pro from the Admin page"
          >
            Upgrade to Pro
          </button>
          <span className="ml-3 text-xs text-amber-600">
            (billing coming soon — admins can enable Pro per user on the Admin page)
          </span>
        </div>
      )}

      {connected.map((integ) => (
        <IntegrationCard key={integ.id} integ={integ} onChange={invalidate} />
      ))}

      {available.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Available
          </h2>
          {available.map((p) => (
            <div
              key={p.provider}
              className="mb-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{p.displayName}</div>
                <div className="text-xs text-zinc-400">{capabilityGapNotes[p.provider]}</div>
              </div>
              {isPro ? (
                <a
                  href={`/api/integrations/${p.provider}/connect`}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Connect
                </a>
              ) : (
                <span className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-500">
                  🔒 Pro
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {connected.length === 0 && available.length === 0 && !data.isLoading && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-500">
          No providers configured yet. An admin needs to add OAuth app credentials (Admin settings or
          env vars <code>MS_TODO_CLIENT_ID/SECRET</code>, <code>GOOGLE_TASKS_CLIENT_ID/SECRET</code>).
        </div>
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
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium">
            {integ.displayName}
            <span
              className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                integ.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}
            >
              {integ.status}
            </span>
          </div>
          <div className="text-xs text-zinc-400">
            {capabilityGapNotes[integ.provider]} · Last sync:{' '}
            {integ.lastSyncAt ? new Date(integ.lastSyncAt).toLocaleString() : 'never'}
          </div>
          {integ.lastError && <div className="mt-1 text-xs text-red-600">⚠ {integ.lastError}</div>}
        </div>
        <button
          onClick={() => resync.mutate()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          {resync.isPending ? 'Re-syncing…' : 'Force re-sync'}
        </button>
        <button onClick={() => disconnect.mutate()} className="text-xs text-red-600 hover:underline">
          Disconnect
        </button>
      </div>

      {integ.status === 'active' && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Target list</span>
            <select
              value={integ.config.defaultListId ?? ''}
              onChange={(e) => {
                const list = lists.data?.lists.find((l) => l.id === e.target.value);
                update.mutate({ defaultListId: e.target.value, defaultListName: list?.name });
              }}
              className="rounded-lg border border-zinc-300 px-2 py-1.5"
            >
              <option value="">Default list</option>
              {(lists.data?.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Direction</span>
            <select
              value={integ.config.direction ?? 'two-way'}
              onChange={(e) => update.mutate({ direction: e.target.value })}
              className="rounded-lg border border-zinc-300 px-2 py-1.5"
            >
              <option value="two-way">Two-way (completion syncs back)</option>
              <option value="outbound">Outbound only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Only sync</span>
            <select
              value={integ.config.filters?.sourceOnly ?? ''}
              onChange={(e) =>
                update.mutate({
                  filters: { ...integ.config.filters, sourceOnly: e.target.value || undefined },
                })
              }
              className="rounded-lg border border-zinc-300 px-2 py-1.5"
            >
              <option value="">All todos</option>
              <option value="ai">AI-created only</option>
              <option value="human">Human-created only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">Minimum priority</span>
            <select
              value={integ.config.filters?.minPriority ?? 0}
              onChange={(e) =>
                update.mutate({
                  filters: { ...integ.config.filters, minPriority: Number(e.target.value) || undefined },
                })
              }
              className="rounded-lg border border-zinc-300 px-2 py-1.5"
            >
              <option value={0}>Any</option>
              <option value={1}>Low+</option>
              <option value={2}>Medium+</option>
              <option value={3}>High only</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
