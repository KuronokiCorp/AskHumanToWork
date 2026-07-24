# todoFromAI (AskHumanToWork) — VecTech Limited product 74

This workspace is a **VecTech Limited product**, managed by the company (rule 8): every
agent here is recorded in the company registry
(`../../05_Organization/Employee_Registry.md`) and its canonical definition lives at HQ
(`../../.claude/agents/`). Product head: **`todofromai-product-manager`** "Henry".

## The fleet and how it works together
- `todofromai-product-manager` v274001 — specs, review, roadmap
- `todofromai-developer` v474001 — implements specs (Node.js)
- `todofromai-tester` v474002 — suite + as-a-consumer verification
- `todofromai-release-manager` v374001 — versioning/changelog/publish prep
- `todofromai-cfo` v374002 "Lehmann" — product finance (functional line to group-cfo Buffon)
- `todofromai-support-manager` v374003 "Neville" — user/issue intake & triage

Work flows: PM spec → developer implements → tester verifies → PM review → release-manager prepares → CEO approves publish.
The PM reviews every result (ACCEPT / REQUEST CHANGES) before it counts as done.

## Session rules
- **Full fleet availability:** launch Claude Code from the company root
  (`~/Documents/vectechlimited`) — all agents are defined there and can work in this
  folder. When launched inside this folder instead, follow this file's pipeline and read
  the HQ agent definitions by path for each role's duties.
- **Daily action record (company rule 7):** every agent writes
  `docs/worklog/<agent>/YYYY-MM-DD.md` (in THIS repo) at session end and reads its own
  last 5 entries at session start — that record is the agent's personality.
- **Public releases stay CEO-approved** (rule 6) — no publish/deploy without the CEO.
- Staffing or scope changes are **proposed to HQ** via the PM, never self-executed.

## History & archive (company rule 12)
This repo is part of the company's history of record. **Session start: `git pull` first** — cloud Zidane and HQ also commit here; an unpulled session works on stale state. Commit and push records (worklogs,
docs, agent files) at the end of any working day that changed them — unpushed history is
unarchived. Sessions load only an agent's last 5 daily entries + latest monthly rollup;
each agent writes `rollups/YYYY-MM.md` from its dailies in its first session of a new
month, after which pushed dailies older than the previous month are pruned (git history
keeps every day — retrieve via `git log --follow` / `git show`). The product head owns
this cadence. Full rule: `../../03_Operations/Worklog/README.md`.

## Who's who — callsigns & numbers
Address anyone by callsign or role slug; registry of record: `../../05_Organization/Employee_Registry.md`.

| Callsign | Role | No. |
|---|---|---|
| **Henry** | `todofromai-product-manager` (head) | v274001 |
| **Roberto Carlos** | `todofromai-release-manager` | v374001 |
| **Lehmann** | `todofromai-cfo` (functional line → group-cfo Buffon) | v374002 |
| **Neville** | `todofromai-support-manager` | v374003 |
| **Rivaldo** | `todofromai-developer` | v474001 |
| **Toldo** | `todofromai-tester` | v474002 |

## Branch model & code review (company rule 15)
CODE follows Git Flow: `main` = production (releasable, CEO-gated), `develop` =
integration/test, `feature/<slug>` = one feature cut from `develop` and owned by the
developer. **Never commit code straight to main/develop** — a feature merges to `develop`
only after **tester PASS + Samuel (code-reviewer) APPROVE**; `develop`→`main` only on a
CEO-approved release. Records (worklogs/briefs/backlog) still commit to `main` (rule 12).
Full standard: `../../05_Organization/Coding_Standard.md`.

## Standing orders (company rule 13)
A session opened here with NO specific command is not idle: the product head reads its
worklog, runs any calendar duty due (KPI/P&L/rollup dates), then works the TOP item of
`BACKLOG.md` through the normal pipeline, ending with a worklog entry and a short brief
(what moved, what's next, what needs a CEO decision). Backlog is owned/ranked by the head.
Full rule: `../../05_Organization/Standing_Orders.md`.

## Rule 16 — CEO decisions are asked as a pick-and-submit question (CEO, 24 Jul 2026)
When this product needs a call from the CEO, do **not** bury it in prose or a long "decisions"
list. Pose it as a **discrete question with 2–4 selectable options the CEO picks and submits**,
**recommended option first** — one decision = one question = one submit. Interactive sessions
render it with the question/selector UI (`AskUserQuestion`); headless/cloud agents write each
CEO decision in that exact shape (one question, concrete options, recommended one marked) in the
brief + CEO todo so it becomes a one-click prompt at review. Reserve questions for genuinely
CEO-reserved calls (releases, money, staffing, direction, outward acts); decide the rest yourself.
Full rule: `../../05_Organization/Org_Chart.md` (rule 16).
