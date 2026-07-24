import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Button, Chip, PageHeader, SectionCard, inputCls } from '../components/ui';

const selectCls =
  'rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-sm  outline-none transition focus:border-accent-500/60';

export default function SettingsAdmin() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['admin-providers'], queryFn: api.adminProviders });

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader
        title="Admin"
        subtitle={
          <>
            Provider OAuth apps and user plans. Redirect URI for OAuth apps:{' '}
            <code className="rounded bg-zinc-200/70 px-1.5 py-0.5 text-[11.5px]">
              {location.protocol}//{location.hostname}:3000/api/integrations/&lt;provider&gt;/callback
            </code>
          </>
        }
      />

      <PlanForm />

      {(providers.data?.providers ?? []).map((p) => (
        <ProviderForm
          key={p.provider}
          provider={p.provider}
          displayName={p.displayName}
          configured={p.configured}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['admin-providers'] })}
        />
      ))}

      <SectionCard title="Where to register OAuth apps">
        <div className="space-y-1.5 text-xs leading-relaxed text-zinc-500">
          <div>
            <b className="text-zinc-300">Microsoft To Do:</b> Azure Portal → App registrations → delegated permission{' '}
            <code className="rounded bg-white/[0.06] px-1">Tasks.ReadWrite</code> +{' '}
            <code className="rounded bg-white/[0.06] px-1">offline_access</code>
          </div>
          <div>
            <b className="text-zinc-300">Google Tasks:</b> Google Cloud Console → OAuth consent + credentials → scope{' '}
            <code className="rounded bg-white/[0.06] px-1">https://www.googleapis.com/auth/tasks</code>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function PlanForm() {
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro'>('pro');
  const [result, setResult] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.setUserPlan(email.trim(), plan),
    onSuccess: (d) => setResult(`✓ ${d.email} → ${d.plan}`),
    onError: (e) => setResult(`✗ ${e instanceof Error ? e.message : e}`),
  });

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          User plans <Chip tone="amber">integrations = Pro-only</Chip>
        </span>
      }
      description="Until billing checkout ships, upgrade users manually here."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) save.mutate();
        }}
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@email.com"
          type="email"
          className={inputCls}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value as 'free' | 'pro')} className={selectCls}>
          <option value="pro">Pro</option>
          <option value="free">Free</option>
        </select>
        <Button type="submit" className="shrink-0">
          Set plan
        </Button>
      </form>
      {result && <div className="mt-2 text-xs text-zinc-400">{result}</div>}
    </SectionCard>
  );
}

function ProviderForm({
  provider,
  displayName,
  configured,
  onSaved,
}: {
  provider: string;
  displayName: string;
  configured: boolean;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const save = useMutation({
    mutationFn: () => api.setAdminProvider(provider, clientId, clientSecret),
    onSuccess: () => {
      setClientId('');
      setClientSecret('');
      onSaved();
    },
  });

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          {displayName}
          <Chip tone={configured ? 'emerald' : 'zinc'}>{configured ? 'configured' : 'not configured'}</Chip>
        </span>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Client ID"
          className={inputCls}
        />
        <input
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client secret"
          type="password"
          className={inputCls}
        />
        <Button type="submit" className="shrink-0">
          Save
        </Button>
      </form>
      {save.isError && <div className="mt-2 text-xs text-red-600">{String(save.error)}</div>}
    </SectionCard>
  );
}
