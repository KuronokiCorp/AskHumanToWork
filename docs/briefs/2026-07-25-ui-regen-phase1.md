# Brief — Phase-1 UI regen built, tested, reviewed, merged to develop (2026-07-25)

**Product:** todoFromAI / AskHumanToWork · **PM:** Henry (v274001)
**Trigger:** CEO escalation "UI 没有重新啊" — the web UI had not been regenerated. Correct: the
spec + branch existed but no implementation had ever been dispatched. This session delivered it.

## What landed
Phase-1 UI regeneration on `feature/ui-regen-dashboard`, now **merged to `develop`** (merge
`436c22c`, pushed). Spec: `docs/specs/ui-regen-claude-code-and-project-dashboard.md`.

- **Claude Code aesthetic** — dark zinc surface, hairline borders, a single warm terracotta
  accent (`#CC785C`), bracketed mono status chips, QuickAdd as a `>` prompt line. The app was
  already fully monospace, so the visible change is the dark repaint + accent + the new home.
- **Project Dashboard as post-login home** (the CEO's ask) — open todos grouped per project,
  overdue-first, `n open` / `n overdue`, 8-per-group + "more", header → project view.
- **IA** — AI Inbox retired (`/inbox-ai` → `/dashboard`); AI provenance kept as a `⚡{agent}`
  badge + a source filter (all/human/ai) on All todos; the existing per-todo AI assistant is
  now surfaced from every row (sparkle → `/t/:id#assistant`) with a visible "AI assistant"
  header (Q3=B visibility half).
- **Landing intro page EXCLUDED** per the CEO scope update mid-build — it keeps its light
  styling; isolation was done by keeping `body` light and dark-scoping only the authed shell.
- **No schema / API-shape change.**

## Gates (rule 15) — cleared
- **Toldo (test): PASS** — new dashboard e2e (AC1–4) + digest guard (AC6). Suites green:
  web e2e **37**, api **12**, core **71**, shared **15**; full typecheck clean. AC5 (Landing
  non-regression) covered by the 12 Landing tests staying green.
- **Samuel (review): ACCEPT** — 7/7 ACs conform, Landing isolation confirmed, typecheck clean.
- **Henry: ACCEPT** and merged `--no-ff` to `develop`.

## Residual (honest, not hidden)
- **Spec §4 production AI-chat verification** (chat *answers*, not 503, persists on refresh)
  is **not done** — no prod login from this environment and prod still serves the OLD UI.
  Run it right after the deploy. Chat is proven locally (chat.spec, 5 green).
- **Env friction:** the Write/Edit path twice injected a NUL byte into `DashboardView.tsx`
  (stripped + re-verified clean); machine hit disk-full (ENOSPC) mid-session (reclaimed).
  Flag to ops.
- Backlog #3 (default due = creation + 1 week) still to ship — designed to ride this same
  release train (independent code path, same version).

## CEO decision needed (rule 16) — one question, pick-and-submit

**Q: Deploy phase-1 UI regen to production now (`develop` → `main`)?**
Production still serves the old UI; this is what lets the CEO finally see the change.

- **A. Deploy now (recommended)** — release `develop`→`main`; Roberto Carlos cuts the
  version/changelog, then App Hosting rollout. Immediately after, Toldo runs the spec §4
  production AI-chat verification. Ship backlog #3 (default due date) in the *same* train or
  the very next.
- **B. Deploy the UI now, hold backlog #3** — same deploy, but keep the +1-week default-due
  change for a later release (it raises agent reminder/digest volume; deploy it deliberately).
- **C. Hold** — keep it on `develop` for a preview pass before any production deploy.

*Reserved to the CEO: this is a public production release (rule 6). Everything up to it is done.*
