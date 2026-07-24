# Brief — todoFromAI — 2026-07-24 session 2 follow-up (Henry) — CEO decisions received, specs drafted

CEO answered the three rule-16 questions (via coordinator): **Q1=A** (app pages + Landing,
mobile out), **Q2=A** (project Dashboard = post-login home, Agenda stays a tab),
**Q3=B** (surface existing assistant AND add AI create/breakdown).

## What moved
- BACKLOG.md updated with the three decisions (marked "CEO decision 2026-07-24") and
  re-sequenced. Approved Cloud Scheduler release **stays #1** — its three steps
  (CRON_SECRET / develop→main / Scheduler job) still await CEO execution.
- Three specs written to `docs/specs/`, dispatch-ready for Rivaldo:
  1. `ui-regen-claude-code-and-project-dashboard.md` — phase 1, M–L (3–5 dev sessions).
     Includes AI-visibility half of Q3=B + Toldo's production verification of the existing chat.
  2. `default-due-one-week.md` — phase 1 train, S (1 dev session).
  3. `ai-plan-and-breakdown.md` — **phase 2**, L (4–6 dev sessions + DB migration), priced
     separately as instructed.
- No product code written (per instruction).

## PM phasing call (authorized): Q3=B split into two deliveries
Phase 1 = visibility + production verification; phase 2 = AI create/breakdown. Reasons:
1. **Data-model dependency:** todos have NO subtask support today (`packages/db/src/schema.ts`
   has no `parentId`) — breakdown needs a schema migration; bundling a migration into a big
   visual repaint makes one giant risky release out of two safe ones.
2. **Verify before extending:** the CEO believed AI was absent; before building MORE on the
   MiniMax path we verify in production that the existing chat actually answers (phase-1 DONE
   criterion). If it doesn't, phase 2's foundation was broken and we'd have found it late.
3. **Time-to-visible-progress:** phase 1 delivers everything the CEO can SEE (new style,
   dashboard, due defaults, visible AI) in one release; generation lands next without blocking it.

## Sequencing / risks
- Cron release (#1) ships first; `feature/ui-regen-dashboard` cuts only after that merge —
  same `packages/web` surface, must not entangle a CEO-approved release.
- Due default will make agent-created todos remind — flagged for release notes.
- Phase-2 `parentId` uses SET NULL on parent deletion so children (human work) survive.

## Next
- Dispatch phase-1 specs to Rivaldo immediately after the cron release lands on `main`
  (blocked only on the CEO executing the approved release steps).
- Roberto Carlos stages the phase-1 release as one version (UI regen + dashboard + due default).
