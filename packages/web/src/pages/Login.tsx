import { useState } from 'react';
import { api } from '../api';

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await api.login(email, password);
      else await api.signup(email, password, Intl.DateTimeFormat().resolvedOptions().timeZone);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="w-96 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-1 text-2xl font-bold">✅ AskHumanToWork</div>
        <p className="mb-6 text-sm text-zinc-500">
          The todo hub for heavy AI users — agents capture, we remind.
        </p>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-3 w-full text-center text-sm text-indigo-600 hover:underline"
        >
          {mode === 'login' ? 'No account? Sign up' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
