import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export default function SettingsAdmin() {
  const qc = useQueryClient();
  const providers = useQuery({ queryKey: ['admin-providers'], queryFn: api.adminProviders });

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-bold">Admin — provider OAuth apps</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Register your own OAuth application with each provider, then paste its credentials here to
        enable the integration for all users. Redirect URI:{' '}
        <code className="rounded bg-zinc-100 px-1">
          {location.protocol}//{location.hostname}:3000/api/integrations/&lt;provider&gt;/callback
        </code>
      </p>
      {(providers.data?.providers ?? []).map((p) => (
        <ProviderForm
          key={p.provider}
          provider={p.provider}
          displayName={p.displayName}
          configured={p.configured}
          onSaved={() => void qc.invalidateQueries({ queryKey: ['admin-providers'] })}
        />
      ))}
      <PlanForm />
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500">
        <div className="mb-1 font-medium text-zinc-700">Where to register:</div>
        <div>
          <b>Microsoft To Do:</b> Azure Portal → App registrations → delegated permission{' '}
          <code>Tasks.ReadWrite</code> + <code>offline_access</code>.
        </div>
        <div>
          <b>Google Tasks:</b> Google Cloud Console → OAuth consent + credentials → scope{' '}
          <code>https://www.googleapis.com/auth/tasks</code>.
        </div>
      </div>
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
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-1 text-sm font-medium">
        User plans
        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
          integrations = Pro-only
        </span>
      </div>
      <p className="mb-2 text-xs text-zinc-500">
        Until billing checkout ships, upgrade users manually here.
      </p>
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
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as 'free' | 'pro')}
          className="rounded-lg border border-zinc-300 px-2 py-2 text-sm"
        >
          <option value="pro">Pro</option>
          <option value="free">Free</option>
        </select>
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Set plan
        </button>
      </form>
      {result && <div className="mt-2 text-xs text-zinc-600">{result}</div>}
    </div>
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
    <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="mb-2 text-sm font-medium">
        {displayName}
        <span
          className={`ml-2 rounded px-1.5 py-0.5 text-xs ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
        >
          {configured ? 'configured' : 'not configured'}
        </span>
      </div>
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
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <input
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="Client secret"
          type="password"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Save
        </button>
      </form>
      {save.isError && <div className="mt-2 text-xs text-red-600">{String(save.error)}</div>}
    </div>
  );
}
