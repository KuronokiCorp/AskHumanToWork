# HQ change record — 22 Jul 2026 (scale-to-zero)

**What changed:** `apphosting.yaml` `minInstances: 1 → 0` (commit `git log --oneline -- apphosting.yaml`
shows it). Executed directly by HQ on the **CEO's cost decision** of 22 Jul (GCP bill: the
always-on instance was the idle cost; ¥50 budget hit 90%).

**Why not through the normal chain:** direct CEO order at HQ level; Henry's team was not
in session. This note is the product-side record so no one here is surprised.

**Consequences for this team:**
- Reminders/digest cron only runs while an instance is awake — **reminders may be delayed
  at zero traffic** until the Cloud Scheduler refactor lands.
- That refactor is now **BACKLOG.md item #1** (Rivaldo implements, Toldo verifies the
  delayed-reminder case, Henry reviews). Deploy of the refactor is CEO-approved (rule 6).
- Expected bill: ~¥80 → ~¥40/month (APAC egress from real traffic remains).

**Verify rollout:** Firebase console → App Hosting → askhumantowork backend → latest
rollout should include this commit (if the backend is not GitHub-connected, someone must
run `firebase deploy --only apphosting` once — counts as the CEO-approved deploy).

---
**Rollout verified 22 Jul (Lehmann):** live Cloud Run service shows minScale=0 on
revision `askhumantowork-build-2026-07-22-004` — backend is GitHub-connected and
auto-deployed commit `27434a1`; no manual deploy needed. Billing breakdown confirms
the ~¥40/month steady-state estimate (¥41 is APAC egress, which remains). Details:
`docs/worklog/todofromai-cfo/2026-07-22.md`.
