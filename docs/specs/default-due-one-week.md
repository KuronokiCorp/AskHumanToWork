# Spec — default due date = creation + 1 week when not set

- **Status:** DRAFT — dispatch with the phase-1 train (BACKLOG #3).
- **Origin:** CEO instruction 2026-07-24 ("due 的默认日期是 1 week 如果没有特别设定").
- **Owner chain:** Henry → Rivaldo → Toldo → Samuel. Branch `feature/default-due-one-week`
  off `develop`. Estimate S (1 dev session incl. tests).

## 1. Behavior change

In `TodoService.create` (`packages/core/src/todo-service.ts`):

- Today: `resolveDue` returns `undefined` when neither `dueNatural` nor `dueAt` is given →
  `dueAt = null` (except the recurrence branch, which derives from a `today 9am` baseline).
- New: when `resolveDue` returns `undefined` AND no recurrence rule applies, default
  `dueAt = resolveNaturalDate('today 9am', user.timezone) + 7 days` — i.e. **7 days out at
  09:00 in the user's timezone**, matching the existing recurrence-baseline convention.
- **Explicit `dueAt: null` in the input stays `null`** — due-less todos remain possible; the
  default only fills ABSENCE, it does not override intent. (`resolveDue`'s
  `null`/`undefined` distinction already encodes this — preserve it.)
- Applies to **all creation sources**: web QuickAdd, REST API, MCP, project-scoped tokens
  (`source: 'ai'` included). `update` is untouched.
- Recurrence branch unchanged. `dueNatural` parsing unchanged.

## 2. Knock-on effects (must be handled, not discovered)

- **Dedup hash** includes `dueAt`: two identical no-due creates on different days now hash
  differently — acceptable (window is short), but the existing idempotency test must be
  re-checked, not deleted.
- **Reminder ladder** derives defaults from `dueAt` → agent-created todos will start getting
  reminders. Intended (CEO wants due dates to mean something), but MUST be called out in the
  changelog and release notes: "todos created without a due date now default to +1 week and
  will remind."
- **Docs:** README API examples + MCP tool description that say "due is optional, defaults to
  none" must be updated to "defaults to one week out".

## 3. Acceptance criteria (executable)

Unit/integration tests (`packages/core`, `packages/api`), all green:
1. Create with no due fields, user tz `Asia/Tokyo` → `dueAt` = today+7d 09:00 JST (assert via
   tz-aware comparison, not string).
2. Create with explicit `dueAt: null` → `dueAt` stays `null`.
3. Create with `dueNatural: 'tomorrow 5pm'` and with explicit ISO `dueAt` → unchanged behavior.
4. Create with `repeat` and no due → recurrence baseline behavior unchanged (existing test).
5. API create via agent token with no due → response `dueAt` ≈ +7d, and a default reminder
   ladder row exists.
6. Full suites green; changelog entry present.
