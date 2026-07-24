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
2. Issue/intake triage with Neville: open user issues ranked
3. Release hygiene with Roberto Carlos: changelog current, next version scoped, CEO-ready
4. Test-coverage review with Toldo: consumer-path gaps
