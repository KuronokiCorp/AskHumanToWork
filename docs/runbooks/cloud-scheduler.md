# Runbook: Cloud Scheduler cron tick

Backlog #1 / spec `docs/specs/cloud-scheduler-cron-tick.md`. With `minInstances: 0`
(CEO cost decision 22 Jul 2026) the in-process pg-boss scheduler cannot fire while the
instance is asleep, so due reminders, the morning digest, inbound polling, session
cleanup and Stripe usage reporting are driven by an external **Cloud Scheduler** job that
POSTs to an authenticated endpoint. The endpoint both wakes the scaled-to-zero instance
and runs everything now due.

> This runbook documents the **CEO-approved deploy step**. Creating the secret and the
> Scheduler job is a production change (rule 6) — it is not executed by the build pipeline.

## Endpoint
`POST <API_BASE_URL>/api/internal/cron/tick`

- Auth: `Authorization: Bearer <CRON_SECRET>` **or** header `X-Cron-Key: <CRON_SECRET>`
  (constant-time compared).
- `CRON_SECRET` unset ⇒ `503 {"error":"cron disabled"}` (fails closed).
- Wrong/missing key ⇒ `401`.
- Success ⇒ `200` with a JSON summary
  (`remindersProcessed`, `remindersFailed`, `remindersDeferred`, `digestsSent`, `polled`,
  `cleaned`, `billingReported`).

## One-time setup (deploy step)

1. Create the secret and grant the backend access:
   ```sh
   openssl rand -hex 32 | tr -d '\n' | firebase apphosting:secrets:set CRON_SECRET --data-file -
   ```
   **The `tr -d '\n'` is load-bearing** (learned 2026-07-24): without it the trailing newline
   is stored INSIDE the secret, the server env keeps it, an HTTP header can never carry one,
   and the constant-time compare fails forever (real key → 401). Same rule for ANY secret
   compared against an HTTP header. Verify safely with a byte count, never by printing:
   `gcloud secrets versions access latest --secret=CRON_SECRET | wc -c` → 64, not 65.
   Then uncomment the `CRON_SECRET` `- variable:/secret:` pair in `apphosting.yaml` and
   redeploy the backend.

2. Create the Scheduler job (every 10 min; deadline < interval so ticks never overlap).
   Header-secret form:
   ```sh
   SECRET=$(gcloud secrets versions access latest --secret=CRON_SECRET)
   gcloud scheduler jobs create http askhumantowork-cron-tick \
     --location=asia-east1 \
     --schedule="*/10 * * * *" \
     --uri="https://askhumantowork--askhumantowork.asia-east1.hosted.app/api/internal/cron/tick" \
     --http-method=POST \
     --headers="X-Cron-Key=${SECRET}" \
     --attempt-deadline=300s
   ```
   (Interval may be tuned 5–15 min. Reminder ladder granularity is due−1d / due−1h / at−due,
   so a 10-min tick delivers at-due reminders within ≤10 min of their fire time.)

## Verify
- `gcloud scheduler jobs run askhumantowork-cron-tick --location=asia-east1` then check the
  job's last-run status is success and the response body summary is present.
- A reminder whose `fireAt` has passed and `status='pending'` flips to `sent` after one tick.
- Each user receives at most one digest per local day (once-per-day guard).

## Notes
- Overlap safety: reminders are claimed atomically (`pending`→`sent`) before delivery, so two
  overlapping ticks never double-send; a transient delivery failure reverts the row to
  `pending` for the next tick (at-least-once).
- The `sync` outbox drain still runs in-process (`RUN_WORKER=true`) — it is triggered by user
  integration actions, which keep the instance awake, so it does not need the tick.
