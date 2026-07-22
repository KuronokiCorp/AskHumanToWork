# BACKLOG — todoFromAI
*Owned and ranked by Henry (todofromai-product-manager). Seeded by HQ 22 Jul 2026 — head MUST review and re-rank in
its first standing session (rule 13). Anyone proposes via the head; empty backlog = head's
failure. Top item is what a no-command session works on.*

1. **Cloud Scheduler cron refactor (raised by CEO cost decision 22 Jul):** minInstances
   is now 0 — the in-process reminders/digest worker only runs while awake. Move due-
   reminder firing to a Cloud Scheduler job hitting an authenticated endpoint every
   5–15 min so reminders stay reliable at scale-to-zero. (Rivaldo implements, Toldo
   verifies delayed-reminder case, Henry reviews.)
2. Issue/intake triage with Neville: open user issues ranked
3. Release hygiene with Roberto Carlos: changelog current, next version scoped, CEO-ready
4. Test-coverage review with Toldo: consumer-path gaps
