import { useEffect, useState } from 'react';
import { BellRing, Bot, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Button, Logo, inputCls } from '../components/ui';

/** Brand marks for the social buttons — inlined so the page pulls no remote assets. */
const providerMeta = {
  google: {
    label: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.4v3.1A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z" />
      </svg>
    ),
  },
  github: {
    label: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
        <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3z" />
      </svg>
    ),
  },
} as const;

const features = [
  {
    Icon: Bot,
    title: 'AI agents capture your todos',
    body: 'Claude and any MCP client file follow-ups straight into your list — with the reason they exist.',
  },
  {
    Icon: BellRing,
    title: 'Reminders that don’t give up',
    body: '1 day before, 1 hour before, at due — then daily nudges until it’s actually done.',
  },
  {
    Icon: RefreshCw,
    title: 'Syncs where you already look',
    body: 'Mirror tasks to Microsoft To Do and Google Tasks, two-way. (Pro)',
  },
];

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Empty unless the deployment has Supabase configured, so an unconfigured
  // install renders no social buttons rather than ones that dead-end.
  const providers = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: api.oauthProviders,
    retry: false,
  });

  /**
   * Supabase returns from the provider with the token in the URL *fragment*,
   * which never reaches the server — so the SPA reads it here and posts it to
   * be exchanged for a session.
   */
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const token = new URLSearchParams(hash).get('access_token');
    const oauthError = new URLSearchParams(hash).get('error_description');
    // Clear the fragment either way: an access token must not sit in the
    // address bar, browser history, or anything the user might paste.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (oauthError) {
      setError(decodeURIComponent(oauthError.replace(/\+/g, ' ')));
      return;
    }
    if (!token) return;
    setBusy(true);
    api
      .oauthCallback(token)
      // A full navigation rather than onDone(): the browser is sitting on
      // /auth/callback, which is a hand-off URL with no view behind it, so
      // refetching in place would leave the user on a blank route.
      .then(() => window.location.replace('/agenda'))
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'sign-in failed');
        setBusy(false);
      });
  }, [onDone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'forgot') {
        await api.forgotPassword(email);
        setNotice('If that address has an account, a reset link is on its way. Check your inbox.');
      } else if (mode === 'login') {
        await api.login(email, password);
        onDone();
      } else {
        await api.signup(email, password, Intl.DateTimeFormat().resolvedOptions().timeZone);
        onDone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-zinc-950 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 20% 0%, rgb(124 58 237 / 0.35), transparent), radial-gradient(ellipse 60% 50% at 100% 100%, rgb(79 70 229 / 0.25), transparent)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <Logo size={34} />
          <div>
            <div className="text-[15px] font-bold text-white">AskHumanToWork</div>
            <div className="text-[11px] text-zinc-500">your AI asks · you do</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-[32px] font-bold leading-tight tracking-tight text-white">
            Your AI remembers.
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-indigo-300 bg-clip-text text-transparent">
              You get it done.
            </span>
          </h1>
          <div className="mt-9 space-y-5">
            {features.map(({ Icon, title, body }) => (
              <div key={title} className="flex max-w-md gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-violet-300 ring-1 ring-white/10">
                  <Icon size={17} />
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-zinc-100">{title}</div>
                  <div className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-400">{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-[11px] text-zinc-600">
          Every AI-created todo carries provenance — you always know why it exists.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-zinc-100/70 p-8">
        <form onSubmit={submit} className="w-full max-w-[360px] animate-fade-in">
          <div className="mb-7 lg:hidden">
            <Logo size={34} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </h2>
          <p className="mb-6 mt-1 text-sm text-zinc-500">
            {mode === 'login'
              ? 'Sign in to see what your AI has planned for you.'
              : mode === 'signup'
                ? 'Free forever for capture + reminders.'
                : "Enter your email and we'll send a reset link."}
          </p>

          {mode !== 'forgot' && (providers.data?.providers.length ?? 0) > 0 && (
            <>
              <div className="mb-4 grid gap-2">
                {providers.data!.providers.map(({ provider, url }) => (
                  <a
                    key={provider}
                    href={url}
                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition-all hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98]"
                  >
                    {providerMeta[provider].icon}
                    Continue with {providerMeta[provider].label}
                  </a>
                ))}
              </div>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-400">or</span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>
            </>
          )}

          <label className="mb-1.5 block text-[13px] font-medium text-zinc-700">Email</label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputCls} mb-4`}
            placeholder="you@example.com"
          />
          {mode !== 'forgot' && (
            <>
              <label className="mb-1.5 block text-[13px] font-medium text-zinc-700">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} mb-5`}
                placeholder="••••••••"
              />
            </>
          )}
          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
              {notice}
            </div>
          )}
          <Button disabled={busy} className="w-full justify-center py-2.5">
            {busy ? 'One sec…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </Button>
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="mt-4 w-full text-center text-[13px] font-medium text-violet-600 hover:text-violet-800"
          >
            {mode === 'login' ? 'No account? Sign up free' : 'Have an account? Sign in'}
          </button>
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => setMode('forgot')}
              className="mt-2 w-full text-center text-[12px] text-zinc-400 hover:text-zinc-600"
            >
              Forgot password?
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
