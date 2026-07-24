import type { ReactNode } from 'react';

/** Brand mark: warm terracotta rounded square with a check (Claude Code accent). */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-accent-400 to-accent-600 text-white"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12.8 9.6 18 19.5 6.5" />
      </svg>
    </span>
  );
}

export function PageHeader({ title, subtitle, badge, children }: { title: string; subtitle?: ReactNode; badge?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-bold tracking-tight text-zinc-100">{title}</h1>
        {badge}
        {children && <div className="ml-auto">{children}</div>}
      </div>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
    </div>
  );
}

export function SectionCard({ title, description, children, tone = 'default' }: { title?: ReactNode; description?: ReactNode; children: ReactNode; tone?: 'default' | 'success' | 'warn' }) {
  const tones = {
    default: 'border-white/10 bg-white/[0.02]',
    success: 'border-emerald-500/25 bg-emerald-500/[0.06]',
    warn: 'border-amber-500/25 bg-amber-500/[0.06]',
  } as const;
  return (
    <div className={`mb-4 rounded-xl border p-5 ${tones[tone]}`}>
      {title && <div className="mb-1 text-sm font-semibold text-zinc-100">{title}</div>}
      {description && <p className="mb-3 text-[13px] leading-relaxed text-zinc-400">{description}</p>}
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const variants = {
    primary:
      'bg-accent-500 text-white hover:bg-accent-600 active:scale-[0.98]',
    secondary:
      'border border-white/15 bg-white/[0.03] text-zinc-200 hover:border-white/25 hover:bg-white/[0.06] active:scale-[0.98]',
    danger: 'text-red-400 hover:bg-red-500/10',
    ghost: 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
  } as const;
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** In-app (dark surface) input. Login/Landing keep their own light styling. */
export const inputCls =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-accent-500/60 focus:ring-4 focus:ring-accent-500/10';

export function Chip({ children, tone = 'zinc', title }: { children: ReactNode; tone?: 'zinc' | 'accent' | 'violet' | 'red' | 'amber' | 'emerald'; title?: string }) {
  const tones = {
    zinc: 'bg-white/[0.06] text-zinc-300',
    // 'violet' kept as an alias of accent so existing callers keep working post-repaint.
    violet: 'bg-accent-500/15 text-accent-300',
    accent: 'bg-accent-500/15 text-accent-300',
    red: 'bg-red-500/15 text-red-300',
    amber: 'bg-amber-500/15 text-amber-300',
    emerald: 'bg-emerald-500/15 text-emerald-300',
  } as const;
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Bracketed monospace status chip — the terminal-inflected `[doing]` / `[blocked]`
 * signal from the Claude Code aesthetic. Font is already mono app-wide.
 */
export function StatusChip({ status }: { status: string }) {
  const tone: Record<string, string> = {
    open: 'text-zinc-400',
    doing: 'text-accent-300',
    blocked: 'text-amber-300',
    done: 'text-emerald-300',
    cancelled: 'text-zinc-500',
  };
  return <span className={`text-[11px] ${tone[status] ?? 'text-zinc-400'}`}>[{status}]</span>;
}

/** Deterministic pleasant color for projects the user hasn't colored. */
export function projectAutoColor(name: string | null | undefined): string {
  if (!name) return '#71717a';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 46%)`;
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-8 py-14 text-center animate-fade-in">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.04] text-zinc-500">{icon}</div>
      <div className="text-sm font-medium text-zinc-300">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-[13px] text-zinc-500">{hint}</div>}
    </div>
  );
}
