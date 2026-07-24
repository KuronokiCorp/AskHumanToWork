# Spec: Cloud Scheduler cron tick — reliable reminders at scale-to-zero

- **Backlog:** item #1 (raised by CEO cost decision 22 Jul 2026).
- **Author:** Henry (todofromai-product-manager, v274001), 2026-07-24.
- **Owners:** Rivaldo (developer) implements → Toldo (tester) verifies the delayed-reminder
  case → Samuel (code-reviewer) APPROVE → Henry reviews & merges to `develop`.
- **Branch:** `feature/cloud-scheduler-cron-tick` off `develop`. Never commit to main/develop
  directly (rule 15). Deploy + Cloud Scheduler creation stay **CEO-approved** (rule 6) — this
  feature only makes the code/endpoint/config ready.

## Problem

`apphosting.yaml` now runs `minInstances: 0` (CEO cost decision, 22 Jul). All background work
is driven by pg-boss **in-process**: delayed one-shot reminder jobs (`ReminderService.enqueue`
→ `boss.send(startAfter)`) and cron schedules (`boss.schedule` for poll/digest/cleanup/billing
in `packages/api/src/worker.ts`). When the single Cloud Run instance scales to zero, **nothing
polls the queue**, so due reminders and the morning digest do not fire until unrelated traffic
happens to wake the instance. Reminders are the product's core promise; this is a reliability
regression that must be closed before scale-to-zero is safe.

## Goal

Move the *firing* of due scheduled work off the in-process pg-boss scheduler and onto an
**authenticated HTTP endpoint** that an external **Cloud Scheduler** job calls every 5–15 min.
The HTTP call both (a) wakes the scaled-to-zero instance and (b) deterministically processes
everything now due. The `reminders` table stays the source of truth (it already is — see
`reminder-service.ts`); pg-boss delayed jobs stop being the firing mechanism for reminders.

## Requirements

### R1 — Authenticated cron endpoint
- Add `POST /api/internal/cron/tick`.
- Auth: a shared secret in env `CRON_SECRET`. Accept it via `Authorization: Bearer <secret>`
  **or** header `X-Cron-Key: <secret>` (Cloud Scheduler can set either). Compare in
  constant time. No user session required.
- If `CRON_SECRET` is unset/empty → endpoint returns `503 {"error":"cron disabled"}` (fail
  closed; never run unauthenticated). Wrong/missing key → `401`.
- Disable the global rate-limit for this route (`config: { rateLimit: false }`), like
  `/api/health` — Scheduler calls must never be throttled.
- Response: `200` with a JSON summary, e.g.
  `{ ok: true, remindersProcessed, remindersFailed, digestsSent, polled, cleaned }`.
- Register it in `packages/api/src/server.ts` (new `packages/api/src/routes/cron-routes.ts`).

### R2 — Reminders fired from the table, not from pg-boss delay
- Extract the reminder-delivery body currently inside the `QUEUES.reminder` handler in
  `worker.ts` into a **reusable function** (e.g. `deliverDueReminders(ctx, deps)` in a new
  `packages/api/src/reminders-runner.ts`, injecting the api-layer deps it needs:
  `getUserForNotify`, `inQuietHours`, `sendEmail`, `sendWebPush`, `signAction`, `env`). Keep the
  exact delivery behavior: quiet-hours deferral, overdue wording, one-click signed action links,
  overdue-nudge escalation, and the "todo done/cancelled ⇒ cancel reminder" short-circuit.
- The tick selects **due pending** reminders (`status = 'pending' AND fireAt <= now`), ordered by
  `fireAt`, in a bounded batch (e.g. 200/tick), and delivers each. The existing
  `reminders_fire_idx (status, fireAt)` index already supports this query.
- **No double-send:** claim each reminder atomically so two overlapping ticks (or a still-awake
  pg-boss worker) cannot both deliver it. Acceptable mechanisms: an atomic
  `UPDATE ... SET status='sent' WHERE id = ? AND status = 'pending' RETURNING` claim-before-send,
  or `SELECT ... FOR UPDATE SKIP LOCKED` within a transaction, or a new `claimedAt`/status value
  via a drizzle migration. Choose one and document the tradeoff in a code comment. A transient
  delivery failure must not silently drop the reminder without a trace (log it; `remindersFailed`
  counts it).
- **Stop relying on pg-boss delay for reminders:** `ReminderService.enqueue` should no longer be
  the firing path. Either make it a no-op or remove it and its call sites, so reminders fire only
  via the tick. If you keep the pg-boss `QUEUES.reminder` worker registered for the awake/local
  path, it MUST share the same atomic-claim function so it can never double-send with the tick.
  Simpler and preferred: remove the delayed pg-boss reminder job entirely; the tick is the single
  firing authority. `cancelForTodo`/`snooze`/`scheduleForTodo` keep writing the table exactly as
  today.

### R3 — Move the other in-process crons onto the tick (so scale-to-zero breaks nothing silently)
The same scale-to-zero problem hits every `boss.schedule` cron. Drive them from the tick too:
- **Digest** (`digest.ts`): run the per-user local-hour digest from the tick. **Idempotency
  guard required:** because the tick runs every 5–15 min, `isLocalHour` is true for a user's whole
  target hour, which would send the digest many times. Add a per-user **once-per-day** guard
  (e.g. a `lastDigestOn` date column via migration, or a lightweight sent-log) so each user gets
  at most one digest per local day. This guard is a **hard acceptance criterion**.
- **Inbound poll** (`runInboundPollers`) and **cleanup** (`cleanupExpiredSessions`): run from the
  tick. Cleanup is naturally idempotent; poll should be safe to run each tick (it already drains).
- **Billing** (`reportPendingUsage`): run from the tick when Stripe is configured (it is already
  idempotent — reports pending usage).
- You MAY keep the pg-boss `boss.schedule` registrations as a redundant awake-path belt-and-braces
  **only if** every handler is idempotent under R2/R3 guards. If that is not cleanly provable,
  remove the schedules and let the tick be the sole driver — correctness beats redundancy.

### R4 — Config & docs (no deploy)
- Add `CRON_SECRET` to `.env.example` (commented, with a `openssl rand -base64 32` hint) and wire
  `env.cronSecret` in `packages/api/src/env.ts`.
- In `apphosting.yaml`, add `CRON_SECRET` as a **secret reference** (Cloud Secret Manager), with a
  comment that the secret + the Cloud Scheduler job are created at the CEO-approved deploy step
  (mirror the existing secret comments). Do **not** inline any secret value.
- Add a short `docs/runbooks/cloud-scheduler.md`: the exact `gcloud scheduler jobs create http`
  command (every 10 min, POST to `<API_BASE_URL>/api/internal/cron/tick`, OIDC or `X-Cron-Key`
  from the secret, `--attempt-deadline` shorter than the interval so ticks never overlap), and how
  to verify. This is documentation for the human deploy step, not an executed deploy.

## Acceptance criteria (executable)
1. `pnpm -r typecheck` and `pnpm -r build` clean.
2. New/updated tests pass (`pnpm -r test`) against real Postgres, including:
   - **Delayed-reminder case (Toldo's headline):** a reminder whose `fireAt` is in the past and
     `status='pending'` (i.e. it "came due while the instance was asleep") is delivered on the next
     `deliverDueReminders`/tick call, and its row flips to `sent`. A reminder with `fireAt` in the
     future is **not** delivered.
   - **No double-send:** two back-to-back tick calls deliver a due reminder exactly once.
   - **Quiet hours still deferred**, and **done/cancelled todo ⇒ reminder cancelled, not sent**.
   - **Digest idempotency:** two ticks within the same user-local hour send the digest at most once.
3. Endpoint auth: no/`wrong` key ⇒ 401; unset `CRON_SECRET` ⇒ 503; correct key ⇒ 200 + summary.
4. `flutter`/npm hygiene N/A; this is the Node service. Leave the tree `pnpm -r typecheck`-clean.

## Out of scope
- Creating the actual Cloud Scheduler job and setting the secret (CEO-approved deploy).
- Any npm publish / release (that is Roberto Carlos + CEO).
- Reworking the mobile local-notification scheduling (unaffected — it reads `pendingForUser`).
