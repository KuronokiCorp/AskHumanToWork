import { useEffect, useState } from 'react';
import { Logo } from '../components/ui';

const REPO_URL = 'https://github.com/KuronokiCorp/AskHumanToWork';
const MCP_COMMAND = 'claude mcp add heyhuman --env TODO_API_TOKEN=<your-token> -- npx -y heyhuman-mcp';

const NAV_LINKS = [
  { label: 'How it works', href: `${REPO_URL}#readme` },
  { label: 'MCP', href: `${REPO_URL}#mcp-surface` },
  { label: 'API', href: `${REPO_URL}#auth-model` },
  { label: 'GitHub', href: REPO_URL },
];

const PILLS = [
  { label: 'Quick start', href: `${REPO_URL}#tutorial--zero-to-your-first-ai-captured-todo` },
  { label: 'Get a token', href: '/login' },
  { label: 'Self-host', href: `${REPO_URL}#deploying` },
  { label: 'Architecture', href: `${REPO_URL}#architecture` },
];

/** Reveal `text` one character at a time after `startDelay`. */
function useTypewriter(text: string, speed = 38, startDelay = 600) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (interval) clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay]);

  return { displayed, done };
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pillsVisible, setPillsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const { displayed, done } = useTypewriter(
    'Your agents capture todos over MCP. You do the work. One agenda, escalating reminders, full provenance.',
  );

  // Reveal the actions shortly after load, independent of the typewriter.
  useEffect(() => {
    const t = setTimeout(() => setPillsVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  const copyCommand = () => {
    void navigator.clipboard?.writeText(MCP_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative min-h-screen bg-zinc-50 text-zinc-900">
      {/* Navbar */}
      <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between bg-zinc-50/80 px-5 py-4 backdrop-blur-sm sm:px-8 sm:py-5">
        <a href="/" className="flex items-center gap-3">
          <Logo size={26} />
          <span className="text-[15px] font-bold tracking-tight sm:text-[17px]">
            askhumantowork
          </span>
          <span className="select-none text-[19px] sm:text-[22px]" style={{ letterSpacing: '-0.02em' }} aria-hidden>
            ✳︎
          </span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-6 text-[14px] text-zinc-600 md:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <a key={label} href={href} className="transition-opacity hover:opacity-60">
              {label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <a
          href="/login"
          className="hidden text-[14px] underline underline-offset-2 transition-opacity hover:opacity-60 md:inline"
        >
          Sign in
        </a>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex flex-col gap-[5px] md:hidden"
        >
          <span
            className="h-[2px] w-6 bg-black transition-transform duration-300"
            style={menuOpen ? { transform: 'translateY(7px) rotate(45deg)' } : undefined}
          />
          <span
            className="h-[2px] w-6 bg-black transition-opacity duration-300"
            style={menuOpen ? { opacity: 0 } : undefined}
          />
          <span
            className="h-[2px] w-6 bg-black transition-transform duration-300"
            style={menuOpen ? { transform: 'translateY(-7px) rotate(-45deg)' } : undefined}
          />
        </button>
      </nav>

      {/* Mobile overlay */}
      <div
        className="fixed inset-0 z-[9] flex flex-col justify-center gap-8 bg-white/95 px-8 backdrop-blur-sm transition-opacity duration-300 md:hidden"
        style={{ opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? 'auto' : 'none' }}
      >
        {NAV_LINKS.map(({ label, href }) => (
          <a key={label} href={href} className="text-[24px] font-medium" onClick={() => setMenuOpen(false)}>
            {label}
          </a>
        ))}
        <a href="/login" className="text-[24px] font-medium underline underline-offset-2">
          Sign in
        </a>
      </div>

      {/* Hero */}
      <section className="relative z-[1] flex min-h-screen flex-col justify-end overflow-hidden px-5 pb-12 sm:px-8 md:justify-center md:px-10 md:pb-0">
        <div className="relative z-10 max-w-2xl">
          {/* Blurred intro label */}
          <div
            className="pointer-events-none mb-5 select-none text-zinc-800 sm:mb-6"
            style={{ fontSize: 'clamp(15px, 3vw, 20px)', lineHeight: 1.4, filter: 'blur(3px)' }}
          >
            Hey there — meet HeyHuman,
            <br />
            the todo hub where your AI asks you to work
          </div>

          {/* Typewriter line */}
          <p
            className="mb-6 sm:mb-7"
            style={{ fontSize: 'clamp(15px, 3vw, 20px)', lineHeight: 1.5, minHeight: 54 }}
          >
            <span className="mr-2 text-violet-600" aria-hidden>
              ❯
            </span>
            {displayed}
            {!done && (
              <span
                data-testid="cursor"
                className="ml-[2px] inline-block h-[1.1em] w-[8px] bg-zinc-900 align-middle"
                style={{ animation: 'blink 1s step-end infinite' }}
              />
            )}
          </p>

          {/* Terminal quick-start block */}
          <div className="mb-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-4 text-[12.5px] leading-relaxed shadow-card sm:mb-7 sm:text-[13.5px]">
            <div className="mb-2 flex items-center gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
            </div>
            <div className="whitespace-nowrap">
              <span className="text-violet-600">❯</span> {MCP_COMMAND}
            </div>
            <div className="text-emerald-600">✓ connected — todos your AI captures land in your agenda</div>
          </div>

          {/* Action pills */}
          <div
            data-testid="pills"
            className="flex flex-wrap gap-y-1"
            style={{
              opacity: pillsVisible ? 1 : 0,
              transform: pillsVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}
          >
            {PILLS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-black/10 bg-white px-4 py-[0.35em] text-[13px] transition-colors duration-200 hover:bg-black hover:text-white sm:px-5 sm:text-[14px]"
              >
                {label}
              </a>
            ))}

            {/* Outline pill: copy the MCP command */}
            <button
              type="button"
              onClick={copyCommand}
              className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-black bg-transparent px-4 py-[0.35em] text-[13px] transition-colors duration-200 hover:bg-black hover:text-white sm:gap-3 sm:px-5 sm:text-[14px]"
            >
              <span>{copied ? 'Copied!' : 'Copy: claude mcp add heyhuman'}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="9" y="9" width="12" height="12" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Below the fold: what it looks like */}
      <section className="px-5 pb-16 sm:px-8 md:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <span className="mr-2 text-violet-600" aria-hidden>
              ❯
            </span>
            the agenda your agents fill
          </div>
          <img
            src="/screenshot-agenda.png"
            alt="AskHumanToWork agenda: month calendar with due-day dots beside Today, Overdue and This-week sections, each todo showing which agent captured it"
            loading="lazy"
            className="w-full rounded-2xl border border-zinc-200 shadow-card"
          />
          <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-500">
            Todos your agents capture over MCP land here in real time — dated ones on the
            calendar, undated ones in their own section, every card carrying which agent asked.
          </p>
        </div>
      </section>
    </div>
  );
}
