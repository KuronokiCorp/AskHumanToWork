import type { ReactNode } from 'react';

/** Brand mark: gradient rounded square with a check. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-violet-600 to-indigo-500 text-white shadow-glow"
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
        <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
        {badge}
        {children && <div className="ml-auto">{children}</div>}
      </div>
      {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
    </div>
  );
}

export function SectionCard({ title, description, children, tone = 'default' }: { title?: ReactNode; description?: ReactNode; children: ReactNode; tone?: 'default' | 'success' | 'warn' }) {
  const tones = {
    default: 'border-zinc-200/80 bg-white',
    success: 'border-emerald-200 bg-emerald-50/60',
    warn: 'border-amber-200 bg-amber-50/70',
  } as const;
  return (
    <div className={`mb-4 rounded-2xl border p-5 shadow-card ${tones[tone]}`}>
      {title && <div className="mb-1 text-sm font-semibold">{title}</div>}
      {description && <p className="mb-3 text-[13px] leading-relaxed text-zinc-500">{description}</p>}
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const variants = {
    primary:
      'bg-gradient-to-b from-violet-600 to-violet-700 text-white shadow-sm hover:from-violet-500 hover:to-violet-700 active:scale-[0.98]',
    secondary:
      'border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98]',
    danger: 'text-red-600 hover:bg-red-50',
    ghost: 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800',
  } as const;
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const inputCls =
  'w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm shadow-card outline-none transition placeholder:text-zinc-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10';

export function Chip({ children, tone = 'zinc', title }: { children: ReactNode; tone?: 'zinc' | 'violet' | 'red' | 'amber' | 'emerald'; title?: string }) {
  const tones = {
    zinc: 'bg-zinc-100 text-zinc-600',
    violet: 'bg-violet-100 text-violet-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  } as const;
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white/50 px-8 py-14 text-center animate-fade-in">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">{icon}</div>
      <div className="text-sm font-medium text-zinc-600">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-[13px] text-zinc-400">{hint}</div>}
    </div>
  );
}
