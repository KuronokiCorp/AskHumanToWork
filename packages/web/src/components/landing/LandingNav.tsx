import { useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Logo } from '../ui';

const REPO_URL = 'https://github.com/KuronokiCorp/AskHumanToWork';

export const NAV_LINKS = [
  { label: 'How it works', href: `${REPO_URL}#tutorial--zero-to-your-first-ai-captured-todo` },
  { label: 'MCP', href: `${REPO_URL}#mcp-surface` },
  { label: 'GitHub', href: REPO_URL },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="animate-fade-down relative z-20 px-5 py-4 sm:px-8 sm:py-5 lg:px-10">
      <div className="flex items-center justify-between gap-3">
        {/* min-w-0 + truncate so the wordmark yields to the CTA on a 320px
            screen instead of running underneath it. */}
        <a href="/" className="flex min-w-0 items-center gap-2.5 text-zinc-900">
          <Logo size={26} />
          <span className="truncate text-[15px] font-bold tracking-tight sm:text-[17px]">
            askhumantowork
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(({ label, href }, i) => (
            <a
              key={label}
              href={href}
              className="flex items-center gap-1 text-[13px] text-zinc-700 transition-colors hover:text-zinc-900"
            >
              {label}
              {i === 0 && <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
            </a>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/login"
            className="whitespace-nowrap rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800 sm:px-5"
          >
            Sign in
          </a>
          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-900/10 md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          data-testid="mobile-menu"
          className="animate-fade-up absolute left-4 right-4 top-full rounded-2xl bg-white/80 px-5 py-3 ring-1 ring-zinc-200 backdrop-blur-xl"
        >
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              className="block border-b border-zinc-200 py-2.5 text-[15px] text-zinc-700 transition-colors last:border-b-0 hover:text-zinc-900"
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
