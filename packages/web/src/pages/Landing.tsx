import { useState } from 'react';
import { ArrowUp, Sparkles } from 'lucide-react';
import LandingNav from '../components/landing/LandingNav';
import ScaledDashboard from '../components/landing/ScaledDashboard';
import DashboardMockup from '../components/landing/DashboardMockup';

const REPO_URL = 'https://github.com/KuronokiCorp/AskHumanToWork';

/**
 * Full-viewport hero.
 *
 * The background is a CSS gradient rather than an image: it costs no request,
 * never 404s, and scales to any viewport. The soft band at the bottom is what
 * the dashboard appears to rise out of.
 */
export default function Landing() {
  const [capture, setCapture] = useState('');

  // The capture bar is a teaser for quick-add, not a working input — anything
  // typed is carried to sign-up rather than silently dropped.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const draft = capture.trim();
    window.location.assign(draft ? `/login?draft=${encodeURIComponent(draft)}` : '/login');
  };

  return (
    <div
      className="relative flex min-h-[100svh] flex-col overflow-hidden bg-cover bg-center"
      style={{
        backgroundImage:
          'radial-gradient(120% 80% at 50% -10%, #ede9fe 0%, #f4f4f5 45%, #fafafa 100%)',
      }}
    >
      <LandingNav />

      <div className="min-h-8 flex-1 shrink-0 sm:min-h-12 lg:min-h-16" />

      {/* Hero content */}
      <div className="relative z-20 flex flex-col items-center px-5 text-center sm:px-8">
        <h1 className="font-normal leading-[1.05] tracking-tight text-zinc-900">
          <span className="animate-fade-up block text-[40px] min-[400px]:text-[44px] sm:text-6xl lg:text-7xl xl:text-[80px]">
            Your AI remembers.
          </span>
          <span className="animate-fade-up block text-[40px] [animation-delay:100ms] min-[400px]:text-[44px] sm:text-6xl lg:text-7xl xl:text-[80px]">
            You get it done.
          </span>
        </h1>

        <form
          onSubmit={submit}
          className="animate-fade-up mt-5 w-full max-w-xl [animation-delay:220ms] sm:mt-6"
        >
          <div className="flex items-center gap-3 rounded-full bg-white/60 py-1.5 pl-5 pr-1.5 ring-1 ring-zinc-200 backdrop-blur-md">
            <input
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              aria-label="Capture a todo"
              placeholder="Ship the release notes @friday 5pm #Work"
              className="flex-1 bg-transparent py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 sm:text-base"
            />
            <button
              type="submit"
              aria-label="Capture"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-transform hover:scale-105 active:scale-95 sm:h-10 sm:w-10"
            >
              <ArrowUp className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </button>
          </div>
        </form>

        <p className="animate-fade-up mt-4 max-w-xl text-sm leading-relaxed text-zinc-600 [animation-delay:340ms] sm:mt-5 sm:text-base lg:text-lg">
          Every follow-up your agents promised, filed with the reason it exists
          <br />
          — and nagged until it's done, straight from{' '}
          <Sparkles className="-mt-1 inline h-4 w-4" aria-hidden /> Claude
        </p>

        <div className="animate-fade-up mt-4 flex flex-wrap items-center justify-center gap-3 [animation-delay:460ms] sm:mt-5">
          <a
            href="/login"
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-800 hover:shadow-lg"
          >
            Start free
          </a>
          <a
            href={`${REPO_URL}#5-connect-claude--the-main-event`}
            className="rounded-full px-6 py-2.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 transition-colors hover:bg-zinc-100"
          >
            Connect Claude
          </a>
        </div>
      </div>

      <div className="min-h-10 flex-1 shrink-0 sm:min-h-12 lg:min-h-16" />

      {/* Dashboard rises out of the band below */}
      <div className="animate-hero-rise relative z-0 mx-auto -mb-10 w-[92%] max-w-4xl shrink-0 [animation-delay:620ms] sm:-mb-20 sm:w-[84%] lg:-mb-32 lg:w-[72%]">
        <ScaledDashboard>
          <DashboardMockup />
        </ScaledDashboard>
      </div>

      {/* Stands in for the spec's grass layer: a soft band the mockup emerges
          from. Self-hosted CSS, so there is no external asset to rot. */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 z-10 h-24 w-full select-none sm:h-32"
        style={{
          background: 'linear-gradient(to top, rgba(237,233,254,0.95) 0%, rgba(244,244,245,0) 100%)',
        }}
      />
    </div>
  );
}
