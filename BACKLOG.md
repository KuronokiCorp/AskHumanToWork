# BACKLOG — todoFromAI

> **✅ RELEASE EXECUTED (2026-07-24):** Cloud Scheduler cron refactor is LIVE — `CRON_SECRET` created + IAM-granted, `develop`→`main` released (merge 66b9e89, App Hosting rollout verified), Scheduler job `askhumantowork-cron-tick` created (asia-east1, */10 * * * *) and first run verified per the runbook. Details: `docs/briefs/2026-07-24-cron-release-executed.md`.

> **🟡 CEO DISPATCH (2026-07-24) — FYI:** DeepSeek V4 正式版全量上线,旧接口今日永久停用。
> No current DeepSeek usage found in this product — note for future model selection; no action needed.
> Full dispatch: `../../03_Operations/Dispatches/2026-07-24-deepseek-v4.md`.

*Owned and ranked by Henry (todofromai-product-manager). Seeded by HQ 22 Jul 2026 — head MUST review and re-rank in
its first standing session (rule 13). Anyone proposes via the head; empty backlog = head's
failure. Top item is what a no-command session works on.*

1. ~~**Cloud Scheduler cron refactor**~~ — **DONE & RELEASED 2026-07-24.** Chain: spec →
   Rivaldo build → Toldo PASS → Samuel APPROVE → Henry ACCEPT → merge 08eae38 to `develop` →
   CEO approved + chose "execute now" (rule 16) → Henry executed the deploy per
   `docs/runbooks/cloud-scheduler.md`: `CRON_SECRET` created (IAM mirrored from
   MINIMAX_API_KEY bindings), ref enabled in apphosting.yaml (1d76e5a), release merge
   `develop`→`main` 66b9e89, Cloud Scheduler API enabled, job `askhumantowork-cron-tick`
   created. Verification: no key → 401 ✓, wrong key → 401 ✓; real-key 200 + Scheduler first
   run verified after the secret-v2 rollout retry (two incidents en route — trailing-newline
   secret + EMAXCONNSESSION rollout failure — full account in
   `docs/briefs/2026-07-24-cron-release-executed.md`).
   Residual: Roberto Carlos to record version/changelog for this release next session.
2. ~~**[PHASE 1] Web UI regeneration (Claude Code aesthetic) + project Dashboard as home**~~
   — **BUILT + TESTED + REVIEWED + MERGED TO `develop` 2026-07-25; production deploy pending
   CEO.** Chain: Rivaldo build → Toldo PASS (web e2e 37 / api 12 / core 71 / shared 15, full
   typecheck) → Samuel APPROVE → Henry ACCEPT → merge `--no-ff` 436c22c → pushed. Delivered
   the dark repaint + terracotta accent, the project-grouped `DashboardView` as post-login
   home, AI Inbox retired (`/inbox-ai`→`/dashboard`), `source:ai` provenance badge + source
   filter, and the surfaced per-todo AI assistant (Q3=B visibility half). **CEO scope update
   25 Jul honored: the Landing/introduction page is EXCLUDED from the restyle** (kept light;
   AC5 downgraded to non-regression, its 12 tests green). Spec:
   `docs/specs/ui-regen-claude-code-and-project-dashboard.md`. Brief:
   `docs/briefs/2026-07-25-ui-regen-phase1.md`. **CEO decision (rule 16): deploy
   `develop`→`main`? (recommended: A deploy now)** — see brief.
   **Residual:** spec §4 production AI-chat verification runs AFTER the deploy (prod still
   serves old UI); env hit NUL-injection + disk-full (both handled) — flag to ops.
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
5. **DB connection budget vs Supabase session pooler (found during 24 Jul release):** rollout
   overlap crashed a new revision with `EMAXCONNSESSION` (session-pool limit 15). Review
   per-instance postgres pool size × maxInstances(3) × rollout overlap headroom; consider a
   smaller app pool or transaction-mode pooler for the API path. Estimate S. (Also: patch
   `docs/runbooks/cloud-scheduler.md` secret command with `| tr -d '\n'` — same branch.)
6. Issue/intake triage with Neville: open user issues ranked
7. Release hygiene with Roberto Carlos: changelog current, next version scoped, CEO-ready
8. Test-coverage review with Toldo: consumer-path gaps
