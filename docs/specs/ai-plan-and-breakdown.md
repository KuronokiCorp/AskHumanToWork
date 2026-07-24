# Spec — AI create & breakdown (natural language → structured todos + subtasks)

- **Status:** DRAFT, **PHASE 2** — dispatches only after
  `ui-regen-claude-code-and-project-dashboard` ships (PM phasing call, coordinator-authorized
  2026-07-24; rationale in `docs/briefs/2026-07-24-ceo-decisions-and-specs.md`).
- **Origin:** CEO decision 2026-07-24, Q3=B.
- **Owner chain:** Henry → Rivaldo → Toldo → Samuel. Branch `feature/ai-plan-breakdown`
  off `develop`. Estimate **L (4–6 dev sessions + DB migration)** — priced separately per
  coordinator instruction.

## 1. Data model (prerequisite — todos have no subtask support today)

`packages/db/src/schema.ts`: add nullable self-reference `parentId` to `todos`
(`uuid`, FK → `todos.id`, `ON DELETE CASCADE`? **No — `SET NULL`**, a parent's completion or
deletion must not silently destroy human work; orphaned children become normal todos).
Drizzle migration + `serializeTodo` exposes `parentId`; shared schema adds it (nullable).
Depth is limited to ONE level: a child cannot itself have children (service-level guard).

UI: TodoDetail lists children with status chips and a completion count on the parent row
(`2/5` mono chip in lists/dashboard). Children appear in Agenda/lists as normal todos with a
`↳ parent-title` mono chip. Dashboard group counts count children individually (they are real
work items — this product's unit is "a thing a human must do").

## 2. AI plan endpoint (natural language → proposed todos)

- `POST /api/ai/plan` `{ prompt: string }` → `202`-style proposal, **nothing is created**:
  `{ proposal: [{ title, notes?, dueNatural?, project?, priority?, subtasks?: [{title}] }] }`.
- Server: `TodoPlanService` in `packages/core`, reusing `MiniMaxChatClient` with a strict
  JSON-schema system prompt; invalid model JSON → one retry, then `UserFacingError`.
- Billing/limits: same `aiUsageEvents` + allowance path and the chat rate limit
  (20/min) as `chat-routes.ts`; 503 when `MINIMAX_API_KEY` absent (same convention).
- Web: Dashboard/QuickAdd gains an "AI plan" mode (prompt-line, fits the Claude Code
  aesthetic): user types a goal → editable preview of proposed todos/subtasks → **user
  confirms** → creation via the EXISTING `TodoService.create` (default-due rule from
  `default-due-one-week.md` applies to proposals without dates; human-in-the-loop is the
  product's identity — no silent creation).
- MCP/API surface: expose `plan` as an MCP tool in `packages/mcp` mirroring the endpoint
  (proposal only; creation stays explicit).

## 3. Breakdown (existing todo → subtasks)

- TodoDetail gets **"Break down"** next to the AI-assistant panel: sends a fixed prompt
  through a `TodoChatService`-style call that returns the same proposal shape scoped to
  subtasks of this todo; confirm creates children with `parentId` set.
- Guard: refuse on a todo that already has a parent (one level).

## 4. Acceptance criteria (executable)

1. Migration up/down clean on a seeded DB; existing rows unaffected (`parentId` null).
2. Core: create child with `parentId`; deleting/completing parent leaves child alive
   (orphan check); guard rejects grandchildren.
3. API: `/api/ai/plan` returns a valid proposal for a fixture prompt (MiniMax mocked in CI);
   503 without key; rate-limit and usage-event rows asserted; allowance cutoff behaves like
   chat.
4. Malformed-model-output path: mocked bad JSON → retry → UserFacingError surfaced as 4xx,
   no todos created.
5. Web e2e: plan flow — type goal, edit one proposed title, remove one item, confirm →
   exactly the edited set exists; breakdown flow — parent shows `n/m` chip; children carry
   the `↳` chip in All todos.
6. Full suites green; changelog + README (API + MCP tool docs) updated.

## 5. Non-goals

- No auto-execution, no unconfirmed creation, no multi-level trees, no Stripe changes
  (allowance/billing reused as-is), no mobile.
