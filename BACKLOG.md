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
2. **[PHASE 1] Web UI regeneration in the Claude Code aesthetic + project Dashboard as home
   (CEO instruction 2026-07-24; CEO decisions 2026-07-24: Q1=A app pages + Landing, mobile out
   this round; Q2=A Dashboard is the post-login home, Agenda stays as a tab):**
   one redesign pass covering the IA change and the repaint. Removes the "AI Inbox" tab
   (`/inbox-ai` redirects to `/dashboard`), keeps `source: ai` provenance as badge/filter,
   and surfaces the EXISTING per-todo AI assistant in lists/dashboard (visibility half of Q3=B).
   Spec: `docs/specs/ui-regen-claude-code-and-project-dashboard.md`. Estimate M–L (3–5 dev
   sessions). **Sequencing: starts only after item 1 (approved cron release) has shipped
   `develop`→`main`** — touches `packages/web` broadly, must not entangle the pending release.
   Includes Toldo verifying the AI assistant answers in PRODUCTION with a real login.
3. **[PHASE 1] Default due date = creation + 1 week when not set (CEO instruction 2026-07-24):**
   today `TodoService.create` leaves `dueAt = null` when neither `dueAt` nor `dueNatural` is
   given (`packages/core/src/todo-service.ts`). Change: absent due → default `+7 days at 09:00
   user-local` (matches recurrence baseline convention); EXPLICIT `dueAt: null` stays null.
   All creation sources (web QuickAdd, API/MCP `source: ai`) — release notes must flag that
   agent-created todos start getting due dates → reminder/digest volume rises.
   Spec: `docs/specs/default-due-one-week.md`. Estimate S (1 dev session). Ships with item 2's
   release train (independent code paths, same version).
4. **[PHASE 2] AI create & breakdown — natural language → structured todos + subtasks
   (CEO decision 2026-07-24, Q3=B):** new `POST /api/ai/plan` (MiniMax, same billing/allowance
   path as chat) proposing structured todos from natural language, human-confirmed before
   creation; "Break down" on a todo proposing subtasks. Requires a DATA-MODEL change — todos
   have no parent/subtask support today (`packages/db/src/schema.ts`): add nullable `parentId`
   self-reference + migration + serializer/UI handling. Spec:
   `docs/specs/ai-plan-and-breakdown.md`. Estimate L (4–6 dev sessions + migration).
   **PM phasing call (authorized by coordinator 2026-07-24): delivered as phase 2 after item 2
   ships** — rationale in brief `docs/briefs/2026-07-24-ceo-decisions-and-specs.md`.
5. Issue/intake triage with Neville: open user issues ranked
6. Release hygiene with Roberto Carlos: changelog current, next version scoped, CEO-ready
7. Test-coverage review with Toldo: consumer-path gaps
