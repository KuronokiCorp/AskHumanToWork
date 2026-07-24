# Brief — todoFromAI — 2026-07-24 (Henry) — CEO-approved Cloud Scheduler release EXECUTED

CEO picked "execute now" (rule 16). All three runbook steps done per
`docs/runbooks/cloud-scheduler.md`, each verified before the next.

## Step results
1. **CRON_SECRET created** in Secret Manager (project `askhumantowork`), IAM mirrored from the
   working MINIMAX_API_KEY bindings (accessor+viewer for
   `firebase-app-hosting-compute@…`, versionManager for the App Hosting service agent).
   Ref enabled in `apphosting.yaml` on `develop` (commit 1d76e5a).
   - Note: Firebase CLI auth was stale (`firebase login --reauth` needed); executed via
     `gcloud secrets` + explicit IAM bindings instead — same end state as the runbook's
     `firebase apphosting:secrets:set`.
2. **Release merge `develop`→`main`:** 66b9e89 (--no-ff). App Hosting rollout confirmed live:
   endpoint went 404 → 401 at 19:24 local.
3. **Cloud Scheduler API enabled** (was never enabled on the project) and job
   `askhumantowork-cron-tick` created: asia-east1, `*/10 * * * *`, POST to
   `/api/internal/cron/tick`, `X-Cron-Key` header, 300s attempt deadline.

## Incident during verification (fixed, worth remembering)
First verification: no key → 401 ✓, wrong key → 401 ✓, but the REAL key ALSO got 401.
Root cause: the runbook's `openssl rand -base64 32 |` pipe stores a **trailing newline inside
the secret** (45 bytes, not 44); the server env kept the `\n` while any HTTP header value
cannot carry one — guaranteed mismatch. Fix: secret **version 2** written newline-free
(`openssl rand -hex 32 | tr -d '\n'`, 64 bytes verified by byte-count only — value never
logged), Scheduler job header updated, new rollout triggered (App Hosting pins the secret
version at rollout). Version 1 to be disabled after final verification.
**Runbook must be patched** to `| tr -d '\n'` — queued as a docs fix on the next feature branch.

## Second incident: version-2 rollout FAILED (rollout-2026-07-24-009)
The records push meant to carry secret v2 into a new rollout failed: Cloud Run revision
crashed at startup — `PostgresError EMAXCONNSESSION: max clients reached in session mode
(pool_size: 15)` (Supabase session pooler exhausted while old+new revisions overlapped and
my 30s verification polling kept instances awake). NOT a secret/IAM problem. Traffic stayed
safely on rollout-008 (secret v1 ⇒ endpoint fails closed with 401 — no exposure, reminders
simply not yet live). Mitigation: stopped the polling, let instances scale down, retried the
rollout with this records commit. **Follow-up queued:** DB connection budget review —
maxInstances(3) × per-instance pool vs Supabase session-pool limit 15, plus rollout-overlap
headroom (BACKLOG item).

## Final acceptance — PASSED (rollout-2026-07-24-010 SUCCEEDED, retry worked)
- POST no key → **401** ✓; wrong key → **401** ✓; real key → **200** ✓ with summary:
  `{"ok":true,"remindersProcessed":0,"remindersFailed":11,"remindersDeferred":0,
  "digestsSent":0,"polled":true,"cleaned":true,"billingReported":0}`
- Scheduler first run (`gcloud scheduler jobs run`): `status: {}` (success),
  `lastAttemptTime: 2026-07-24T10:37:22Z`; job ENABLED, next scheduleTime 10:40Z.
- Secret version 1 (newline-tainted) **disabled**; version 2 live in rollout-010.

## Known limitation surfaced by the first tick (pre-existing, NOT a release regression)
`remindersFailed: 11` — the tick correctly claims due reminders, but delivery fails because
**SMTP is not configured** (apphosting.yaml lists SMTP as "Later:"). Before this release these
reminders couldn't even fire at scale-to-zero; now the engine works and delivery is the gap.
At-least-once design reverts them to pending, so they retry each tick until SMTP exists.
Flagged to the CEO: configuring SMTP (provider + creds = money/outward) is a CEO call.

## Phase-1 unblock
Release done ⇒ the UI-regen phase 1 is unblocked. `feature/ui-regen-dashboard` cut off
`develop` and pushed. **Dispatch to Rivaldo: next session** (PM call — a 3–5-session build
should start on a fresh session, not the tail of a release session; specs are dispatch-ready).
