import { useEffect, useRef, useState } from 'react';
import { Logo } from '../components/ui';

/** Marketing video — placeholder asset; swap for a branded clip. */
const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260530_042513_df96a13b-6155-4f6e-8b93-c9dee66fba08.mp4';

const CONTACT_EMAIL = 'hello@askhumantowork.com';
const NAV_LINKS = ['How it works', 'Integrations', 'Pricing', 'Docs'];

const PILLS = [
  'See a live agenda',
  'Connect your AI (MCP)',
  'Set up reminders',
  'Why it works',
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pillsVisible, setPillsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const { displayed, done } = useTypewriter(
    "Glad you're here. Your AI does the thinking — you do the doing. What should we line up first?",
  );

  // Reveal the action pills shortly after load, independent of the typewriter.
  useEffect(() => {
    const t = setTimeout(() => setPillsVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Scrub the background video with horizontal mouse movement.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const SENSITIVITY = 0.8;
    let prevX: number | null = null;
    let targetTime = 0;
    let seeking = false;

    const seek = () => {
      const dur = video.duration;
      if (!dur || Number.isNaN(dur)) return;
      if (Math.abs(video.currentTime - targetTime) < 0.001) {
        seeking = false;
        return;
      }
      seeking = true;
      video.currentTime = targetTime;
    };
    // onSeeked queues the next seek only if the target has moved — avoids flooding.
    const onSeeked = () => {
      if (Math.abs(video.currentTime - targetTime) > 0.01) video.currentTime = targetTime;
      else seeking = false;
    };
    const onMove = (e: MouseEvent) => {
      if (prevX === null) {
        prevX = e.clientX;
        return;
      }
      const delta = e.clientX - prevX;
      prevX = e.clientX;
      const dur = video.duration || 0;
      targetTime = Math.min(
        Math.max(targetTime + (delta / window.innerWidth) * SENSITIVITY * dur, 0),
        dur,
      );
      if (!seeking) seek();
    };

    video.addEventListener('seeked', onSeeked);
    window.addEventListener('mousemove', onMove);
    return () => {
      video.removeEventListener('seeked', onSeeked);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  const copyEmail = () => {
    void navigator.clipboard?.writeText(CONTACT_EMAIL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative min-h-screen text-black" style={{ fontFamily: 'var(--font-body)' }}>
      {/* Background video (mouse-scrub controlled) */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        className="fixed inset-0 h-full w-full object-cover"
        style={{ zIndex: 0, objectPosition: '70% center' }}
      />

      {/* Navbar */}
      <nav className="fixed inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <a href="/" className="flex items-center gap-3">
          <Logo size={30} />
          <span
            className="text-[21px] tracking-tight text-black sm:text-[26px]"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            AskHumanToWork
          </span>
          <span
            className="select-none text-[25px] text-black sm:text-[30px]"
            style={{ letterSpacing: '-0.02em' }}
            aria-hidden
          >
            ✳︎
          </span>
        </a>

        {/* Desktop nav links */}
        <div className="hidden items-center text-[23px] text-black md:flex">
          {NAV_LINKS.map((label, i) => (
            <span key={label}>
              <a href="#" className="transition-opacity hover:opacity-60">
                {label}
              </a>
              {i < NAV_LINKS.length - 1 && <span>, </span>}
            </span>
          ))}
        </div>

        {/* Desktop CTA */}
        <a
          href="/login"
          className="hidden text-[23px] text-black underline underline-offset-2 transition-opacity hover:opacity-60 md:inline"
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
        {NAV_LINKS.map((label) => (
          <a
            key={label}
            href="#"
            className="text-[32px] font-medium text-black"
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </a>
        ))}
        <a href="/login" className="text-[32px] font-medium text-black underline underline-offset-2">
          Sign in
        </a>
      </div>

      {/* Hero */}
      <section className="relative z-[1] flex h-screen flex-col justify-end overflow-hidden px-5 pb-12 sm:px-8 md:justify-center md:px-10 md:pb-0">
        <div className="relative z-10 max-w-xl">
          {/* Blurred intro label */}
          <div
            className="pointer-events-none mb-5 select-none sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.3,
              fontWeight: 400,
              color: '#000',
              filter: 'blur(4px)',
            }}
          >
            Hey there — your agents have been busy,
            <br />
            AskHumanToWork turns their asks into your agenda
          </div>

          {/* Typewriter line */}
          <p
            className="mb-5 text-black sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.35,
              fontWeight: 400,
              minHeight: 54,
            }}
          >
            {displayed}
            {!done && (
              <span
                className="ml-[2px] inline-block h-[1.1em] w-[2px] bg-black align-middle"
                style={{ animation: 'blink 1s step-end infinite' }}
              />
            )}
          </p>

          {/* Action pills */}
          <div
            className="flex flex-wrap gap-y-1"
            style={{
              opacity: pillsVisible ? 1 : 0,
              transform: pillsVisible ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
            }}
          >
            {PILLS.map((label) => (
              <a
                key={label}
                href="/login"
                className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-black/10 bg-white px-4 py-[0.3em] text-[13px] text-black transition-colors duration-200 hover:bg-black hover:text-white sm:px-5 sm:text-[15px]"
              >
                {label}
              </a>
            ))}

            {/* Outline pill: copy contact email */}
            <button
              type="button"
              onClick={copyEmail}
              className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white bg-transparent px-4 py-[0.3em] text-[13px] text-white transition-colors duration-200 hover:bg-white hover:text-black sm:gap-3 sm:px-5 sm:text-[15px]"
            >
              <span>
                {copied ? 'Copied!' : 'Reach us: '}
                {!copied && (
                  <span className="underline underline-offset-1">{CONTACT_EMAIL}</span>
                )}
              </span>
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
    </div>
  );
}
