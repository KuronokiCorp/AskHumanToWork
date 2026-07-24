import { useState } from 'react';
import { api } from '../api';
import { Button, Logo } from '../components/ui';

/** Local light input — reset page keeps its light surface (the app itself is dark). */
const inputCls =
  'w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10';

/** Landing page for the emailed reset link: /reset-password?uid=..&exp=..&sig=.. */
export default function ResetPassword() {
  const params = new URLSearchParams(location.search);
  const uid = params.get('uid') ?? '';
  const exp = Number(params.get('exp') ?? 0);
  const sig = params.get('sig') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(uid, exp, sig, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100/70 p-8">
      <form onSubmit={submit} className="w-full max-w-[360px] animate-fade-in">
        <div className="mb-6 flex items-center gap-3">
          <Logo size={32} />
          <span className="text-[15px] font-bold">AskHumanToWork</span>
        </div>
        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-sm font-semibold text-emerald-800">✓ Password updated</div>
            <p className="mt-1 text-[13px] text-emerald-700">
              All existing sessions were signed out.{' '}
              <a href="/" className="font-medium underline">
                Sign in with your new password →
              </a>
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold tracking-tight">Choose a new password</h2>
            <p className="mb-6 mt-1 text-sm text-zinc-500">This link is valid for one hour.</p>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-700">New password</label>
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} mb-4`}
              placeholder="••••••••"
            />
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-700">Confirm password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`${inputCls} mb-5`}
              placeholder="••••••••"
            />
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {error}
              </div>
            )}
            <Button disabled={busy} className="w-full justify-center py-2.5">
              {busy ? 'One sec…' : 'Set new password'}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
