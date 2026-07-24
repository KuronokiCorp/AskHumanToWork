# BACKLOG — todoFromAI

> **✅ CEO-APPROVED RELEASE (2026-07-24, rule 16):** ship the Cloud Scheduler cron refactor — create `CRON_SECRET`, promote `develop`→`main`, create the Scheduler job per `docs/runbooks/cloud-scheduler.md`. This is the top action.

> **🟡 CEO DISPATCH (2026-07-24) — FYI:** DeepSeek V4 正式版全量上线,旧接口今日永久停用。
> No current DeepSeek usage found in this product — note for future model selection; no action needed.
> Full dispatch: `../../03_Operations/Dispatches/2026-07-24-deepseek-v4.md`.

*Owned and ranked by Henry (todofromai-product-manager). Seeded by HQ 22 Jul 2026 — head MUST review and re-rank in
its first standing session (rule 13). Anyone proposes via the head; empty backlog = head's
failure. Top item is what a no-command session works on.*

1. **Cloud Scheduler cron refactor (raised by CEO cost decision 22 Jul):** minInstances
   is now 0 — the in-process reminders/digest worker only runs while awake. Move due-
   reminder firing to a Cloud Scheduler job hitting an authenticated endpoint every
   5–15 min so reminders stay reliable at scale-to-zero. (Rivaldo implements, Toldo
   verifies delayed-reminder case, Henry reviews.)
   — **BUILT + VERIFIED + MERGED TO `develop` 2026-07-24** (feature/cloud-scheduler-cron-tick,
   merge 08eae38). Spec `docs/specs/cloud-scheduler-cron-tick.md`; runbook
   `docs/runbooks/cloud-scheduler.md`. Toldo PASS (9 api + 71 core + 15 shared green,
   incl. delayed-reminder, no-double-send race, digest once-per-day, endpoint 503/401/200);
   Samuel APPROVE; Henry ACCEPT. **REMAINING — CEO decision:** (a) create `CRON_SECRET` secret +
   uncomment its ref in apphosting.yaml, (b) `develop`→`main` release deploy, (c) create the
   Cloud Scheduler job per the runbook. Release prep is Roberto Carlos's to stage; publish/deploy
   stays CEO-approved (rule 6). Until the secret is set the endpoint returns 503 (safe no-op).
2. **Web UI regeneration in the Claude Code aesthetic (CEO instruction 2026-07-24):**
   regenerate the app's pages referencing Claude Code's visual style (dense, terminal-inflected,
   monospace accents, restrained dark palette). Current UI: dark zinc sidebar shell
   (`packages/web/src/App.tsx`) with Agenda / AI Inbox / All todos + per-project views + Settings.
   Scope wave 1: app shell + Agenda + todo lists + TodoDetail; wave 2: Settings + Landing.
   Do this TOGETHER with item 3 (one IA change, one redesign pass — not two repaints).
   **Sequencing: starts only after item 1 (approved cron release) has shipped `develop`→`main`** —
   the redesign touches `packages/web` broadly and must not entangle the pending release.
   Open (rule-16 question to CEO in brief): whether Landing/mobile are in scope.
3. **Project-grouped Dashboard replaces the "AI Inbox" tab (CEO instruction 2026-07-24):**
   the tab is actually named "AI Inbox" (`/inbox-ai`, `TodosView view="ai"` — a flat filter on
   `source: 'ai'`; CEO judges it not useful). Build a Dashboard that lists open todos grouped
   by project (project header + count + due-soon/overdue signals), remove the AI Inbox nav item,
   and keep AI provenance visible as a badge/filter instead of a dedicated tab (PM call — the
   "which agent asked for this" signal is core to the product and must not be lost).
   Open (rule-16 question to CEO in brief): whether Dashboard becomes the post-login home.
4. **Default due date = creation + 1 week when not set (CEO instruction 2026-07-24):**
   today `TodoService.create` leaves `dueAt = null` when neither `dueAt` nor `dueNatural` is
   given (`packages/core/src/todo-service.ts` resolveDue/create; only recurrence derives one).
   Change: absent due → default `now + 7 days` (09:00 user-local, matching the recurrence
   baseline convention); an EXPLICIT `dueAt: null` stays null so due-less todos remain possible.
   Applies to all creation sources (web QuickAdd, API/MCP `source: ai`) — flag in release notes:
   agent-created todos will start getting due dates, which feeds the reminder ladder and digest
   (expect more reminder volume). Update dedup-hash expectations + tests.
5. **AI-feature visibility — confirm & surface (CEO observation 2026-07-24 says "AI still not
   added"; code says otherwise):** per-todo AI chat (MiniMax-M3) IS built and merged to `main` —
   `packages/core/src/minimax.ts`, `packages/core/src/todo-chat-service.ts`,
   `packages/api/src/routes/chat-routes.ts`, `packages/web/src/components/TodoChat.tsx`
   (rendered in `TodoDetail.tsx`) — and `apphosting.yaml` actively references the
   `MINIMAX_API_KEY` secret (backend boots, prod is up, so the secret exists). BUT it only
   appears inside a single todo's detail page, and `TodoChat` renders NOTHING on 503 — invisible
   when unconfigured and easy to miss even when live. Actions: (a) verify the assistant answers
   in production with a real login; (b) surface AI affordances in the new Dashboard/lists;
   (c) rule-16 question to CEO on what "AI 功能" should mean beyond the per-todo chat.
6. Issue/intake triage with Neville: open user issues ranked
7. Release hygiene with Roberto Carlos: changelog current, next version scoped, CEO-ready
8. Test-coverage review with Toldo: consumer-path gaps
