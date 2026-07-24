# Brief — todoFromAI — 2026-07-24 session 2 (Henry) — CEO instruction intake

CEO instruction (verbatim intent): regenerate pages referencing the Claude Code style; default
due date = 1 week when unset; the "AI box" tab is useless → a dashboard listing todos by
project; AI functionality "still not added"; confirm carefully with the team.

## Confirmed against the code (rule 17 — checked before answering)
1. **"AI box" tab** = the **"AI Inbox"** nav item (`/inbox-ai`, `packages/web/src/App.tsx` →
   `TodosView view="ai"`): a flat list of todos with `source: 'ai'`. No intelligence in it.
2. **No project-grouped dashboard exists.** Agenda groups by time; projects are individual
   sidebar links only.
3. **Due default today is none:** `packages/core/src/todo-service.ts` leaves `dueAt = null`
   when not provided (recurrence excepted).
4. **AI is already built, not missing:** per-todo AI chat (MiniMax-M3) is merged to `main`
   (`packages/core/src/minimax.ts`, `todo-chat-service.ts`,
   `packages/api/src/routes/chat-routes.ts`, `packages/web/src/components/TodoChat.tsx` in
   TodoDetail) and `apphosting.yaml` actively references `MINIMAX_API_KEY` (prod boots + /api/health
   ok ⇒ secret exists ⇒ chat should be live). It is only reachable inside a todo's detail page
   and renders nothing when unconfigured — a discoverability failure, not an absence. We will
   verify with a logged-in production session.

## Backlog changes (BACKLOG.md re-ranked; approved release stays top)
1. (unchanged, CEO-approved) Cloud Scheduler release — CRON_SECRET, develop→main, Scheduler job.
2. NEW — Web UI regeneration, Claude Code aesthetic (CEO 2026-07-24). Starts AFTER #1 ships.
3. NEW — Project-grouped Dashboard replaces AI Inbox tab (CEO 2026-07-24). Built with #2 as one pass;
   `source: ai` provenance survives as badge/filter.
4. NEW — Default due = creation + 7 days @ 09:00 user-local when unset; explicit null stays null;
   all sources incl. API/MCP (reminder/digest volume will rise — flagged).
5. NEW — AI visibility: verify chat in prod, surface AI affordances in the new Dashboard/lists.
6–8. (were 2–4) Neville triage / Roberto Carlos release hygiene / Toldo coverage.

## CEO decisions needed (rule 16 — pick one option per question and submit)

**Q1 — 改版范围:重新生成哪些页面?**
- **A. (推荐) 应用内页面 + Landing 营销页** — 应用先行,Landing 同一风格跟上,对外形象一致。
- B. 仅应用内页面 — 最快,Landing 暂维持现状。
- C. 应用 + Landing + 移动端 (mobile/) — 全量一致,但移动端会显著拉长周期。

**Q2 — 新 Dashboard 的位置:登录后首页是什么?**
- **A. (推荐) Dashboard(按项目分组)成为登录后首页;Agenda(按时间)保留为第二个 tab** —
  项目视角做默认,时间视角不丢。
- B. Agenda 仍是首页,Dashboard 作为并列 tab。
- C. Dashboard 完全取代 Agenda,只留一个主视图。

**Q3 — "AI 功能"的定义:代码里每条 todo 详情页已有 AI 助手(MiniMax),您说"还没加上"——您期望的是?**
- **A. (推荐) 保留现有助手,大幅提升可见性:Dashboard/列表内直接可见 AI 入口,先验证生产环境确实可用** —
  最小改动直达"看得见"。
- B. 在 A 之上新增 AI 生成/拆解 todo(自然语言 → 结构化 + 子任务)— 功能升级,量更大。
- C. 现状即可,只做生产环境验证,不改 UI。

## Risks
- 改版(#2/#3)大面积触碰 `packages/web`,与待发布的 cron release 同仓 — 已排序为 release 先行,避免纠缠。
- 默认 due +1 周会让 API/MCP(AI 代理)创建的 todo 也带上 due → 提醒与 digest 量上升;发布说明会标注。
- 移除 AI Inbox tab 时保留 `source: ai` 来源标识(badge/筛选),产品核心信号不丢。
