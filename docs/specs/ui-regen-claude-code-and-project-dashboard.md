# Spec — UI regeneration (Claude Code aesthetic) + project-grouped Dashboard as home

- **Status:** DRAFT — ready to dispatch to Rivaldo once the Cloud Scheduler release
  (BACKLOG #1) has shipped `develop`→`main`.
- **Origin:** CEO instruction 2026-07-24; CEO decisions 2026-07-24 (rule 16):
  Q1=A (app pages + Landing; mobile out this round), Q2=A (Dashboard = post-login home,
  Agenda stays as a tab), Q3=B visibility half (surface the existing per-todo assistant).
- **Owner chain:** Henry (spec/review) → Rivaldo (build) → Toldo (test) → Samuel (review).
- **Branch:** `feature/ui-regen-dashboard` off `develop`. Estimate M–L (3–5 dev sessions).

## 1. Design language ("Claude Code aesthetic")

Reference is the Claude Code CLI/product look: dense, terminal-inflected, calm dark surface,
one warm accent. Concretely, as tokens in `packages/web/tailwind.config.js` + `components/ui.tsx`:

- **Surface:** near-black base (keep zinc-950 family), hairline `white/8` borders, flat —
  no cards with heavy shadows; sections separated by rules, not boxes.
- **Accent:** single warm terracotta/orange accent (Claude family, e.g. `#CC785C` range) for
  active states, primary buttons, overdue counts. Everything else stays zinc.
- **Type:** UI text stays the current sans; ALL metadata (dates, counts, agent/token names,
  project slugs, status chips) switches to the monospace stack (`ui-monospace, SFMono-Regular,
  Menlo, monospace`) — this is the strongest single "Claude Code" signal.
- **Density:** tighter list rows, uppercase micro-labels for section headers (already partly
  present), status rendered as bracketed mono chips (e.g. `[doing]`, `[blocked]`).
- **QuickAdd** restyled as a prompt line: leading `>` glyph, mono placeholder, Enter submits.
- Applies to: app shell (`App.tsx` sidebar), Agenda, TodosView, TodoDetail, TodoItem, QuickAdd,
  TodoChat, Settings pages (light-touch: tokens/colors only), and **Landing** (`Landing.tsx`
  + `components/landing/*` — same language, marketing copy unchanged unless broken by layout).
- **Out of scope:** `mobile/` (CEO Q1=A), light theme, copy rewrites.

## 2. IA changes

1. **New `DashboardView` at `/dashboard`, the post-login home.**
   - `/` (authed), `/login` (authed), `/auth/callback`, `/landing` → redirect `/dashboard`
     (today they go to `/agenda`).
   - Sidebar nav becomes: **Dashboard**, Agenda, All todos (AI Inbox removed).
2. **`/inbox-ai` route and nav item removed**; route kept as `<Navigate to="/dashboard" />`
   for bookmarks/digest links. `TodosView view="ai"` code path retired.
3. **AI provenance survives the tab:** `TodoItem` shows a mono badge for `source === 'ai'`
   (`⚡ {createdByAgent ?? 'agent'}`), and All todos gets a `source` filter (all/human/ai).
4. **Digest emails / server-rendered links** that point at `/inbox-ai` or `/agenda` as "the app"
   are updated to `/dashboard` (grep `packages/api/src/digest.ts` + templates).

## 3. Dashboard content (the CEO's ask: todos listed per project)

- Groups **open** todos (`open|doing|blocked`) by project; a final **"No project"** group.
- Group order: projects with overdue items first (most overdue first), then by open count desc.
- Group header: color dot, project name, mono `n open`, mono red `n overdue` when > 0;
  header links to `/project/:name`.
- Body: up to 8 todos per group, sorted `dueAt ASC NULLS LAST`, then priority desc — reuse the
  existing `TodoItem`; `+ n more →` link when truncated.
- Each row keeps due chip, status chip, AI provenance badge per §2.3.
- **AI assistant surfacing (Q3=B visibility half):** rows get a small sparkle affordance
  linking to `/t/:id` anchored at the chat panel; TodoDetail's chat panel gets a visible
  header ("AI assistant") instead of rendering silently below the fold.
- Data: existing `GET /api/todos` + `GET /api/projects` are sufficient (client-side grouping,
  limit 200 open todos); **no new API endpoint** unless Rivaldo hits a measured problem — if so,
  propose before building.
- Empty state: prompt-styled hint pointing at QuickAdd and the MCP/API token setup.

## 4. Production verification task (part of DONE)

Toldo verifies with a real login on
`https://askhumantowork--askhumantowork.asia-east1.hosted.app`:
the per-todo AI chat **answers** (not 503, not silent absence) and the reply is persisted on
refresh. If it does NOT answer, that is a release blocker finding reported to Henry, not
something to patch silently.

## 5. Acceptance criteria (executable)

Playwright e2e (`packages/web/tests/e2e/`), all green in CI:
1. Authed visit to `/` lands on `/dashboard`; sidebar shows Dashboard/Agenda/All todos and
   does NOT contain "AI Inbox"; `/inbox-ai` redirects to `/dashboard`.
2. Seeded user with 2 projects + ungrouped todos: dashboard renders one group per project
   plus "No project", counts match seed, overdue count renders for the project with an
   overdue todo, and that group sorts first.
3. A todo seeded with `source: 'ai'`, `createdByAgent: 'heyhuman'` shows the agent badge on
   dashboard and in All todos; the All-todos source filter narrows correctly.
4. Group "view all" navigates to the project view; row click opens `/t/:id`; the chat panel
   header "AI assistant" is visible there.
5. Landing page renders (logged-out `/`), no horizontal scroll at 375px and 1280px, nav links
   work.
6. Digest email template contains no `/inbox-ai` links (unit test on the rendered template).
7. Full existing suites stay green (web e2e + api + core + shared).

## 6. Non-goals / guardrails

- No schema or API-shape changes. No mobile changes. No copy rewrite of Landing.
- Sequencing guardrail: branch cut only after cron release merge lands on `main`, then
  `develop` rebased/synced first.
