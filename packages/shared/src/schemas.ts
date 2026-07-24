import { z } from 'zod';
import {
  TODO_STATUSES,
  TODO_SOURCES,
  REMINDER_CHANNELS,
  PROVIDERS,
  TOKEN_SCOPES,
  CHAT_ROLES,
  BILLING_STATUSES,
} from './enums.js';

// ---------- Entities (API wire shapes) ----------

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string().nullable(),
  archived: z.boolean(),
  createdAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const todoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  projectName: z.string().nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  dueAt: z.string().nullable(), // ISO UTC
  status: z.enum(TODO_STATUSES),
  /** Why this todo can't proceed; set alongside status "blocked". */
  blockedReason: z.string().nullable(),
  priority: z.number().int().min(0).max(3),
  source: z.enum(TODO_SOURCES),
  createdByAgent: z.string().nullable(),
  /** Name of the API token that created this (which device/app). Server-set, authoritative. */
  createdByToken: z.string().nullable(),
  originContext: z.string().nullable(),
  tags: z.array(z.string()),
  /** RRULE-lite; present on recurring todos. Completing one spawns the next occurrence. */
  recurrence: z
    .object({
      freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
      interval: z.number().int().min(1),
      byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
      display: z.string(),
    })
    .nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Todo = z.infer<typeof todoSchema>;

export const reminderSchema = z.object({
  id: z.string().uuid(),
  todoId: z.string().uuid(),
  fireAt: z.string(),
  channel: z.enum(REMINDER_CHANNELS),
  status: z.enum(['pending', 'sent', 'cancelled']),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const integrationSummarySchema = z.object({
  id: z.string().uuid(),
  provider: z.enum(PROVIDERS),
  status: z.enum(['active', 'error', 'revoked']),
  defaultListName: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
});
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;

// ---------- Inputs ----------

export const createTodoInputSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(10_000).optional(),
  /** Natural language due date, resolved server-side in the user's timezone. Preferred. */
  dueNatural: z.string().max(120).optional(),
  /**
   * Absolute ISO 8601 due date. Used only if dueNatural is absent.
   * Pass `null` explicitly to force a due-less todo; omit both due fields and the server
   * defaults dueAt to one week out (BACKLOG #3).
   */
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  /** Project name; fuzzy-matched, created if new. */
  project: z.string().max(100).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  /** Explicit reminder times (ISO or natural). If omitted, a default ladder is derived from dueAt. */
  reminders: z.array(z.string()).max(10).optional(),
  /** Why this todo exists — REQUIRED provenance for AI-created todos. */
  originContext: z.string().max(500).optional(),
  /** Natural-language recurrence, e.g. "every monday", "every 2 weeks". Requires a due date. */
  repeat: z.string().max(80).optional(),
  /** Override which connected providers to mirror to (provider ids). Omit = user's routing rules. */
  syncTo: z.array(z.enum(PROVIDERS)).optional(),
});
export type CreateTodoInput = z.infer<typeof createTodoInputSchema>;

export const updateTodoInputSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  dueNatural: z.string().max(120).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  project: z.string().max(100).nullable().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  status: z.enum(TODO_STATUSES).optional(),
  /** Why this todo is blocked; meaningful with status "blocked", auto-cleared when unblocked. */
  blockedReason: z.string().max(500).nullable().optional(),
  /** Natural-language recurrence; null clears it. */
  repeat: z.string().max(80).nullable().optional(),
});
export type UpdateTodoInput = z.infer<typeof updateTodoInputSchema>;

export const listTodosQuerySchema = z.object({
  status: z.enum(TODO_STATUSES).optional(),
  project: z.string().optional(),
  dueBefore: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  tags: z.array(z.string()).or(z.string().transform((s) => s.split(','))).optional(),
  source: z.enum(TODO_SOURCES).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListTodosQuery = z.infer<typeof listTodosQuerySchema>;

export const signupInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  timezone: z.string().default('UTC'),
});
export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  /** 'session' sets a cookie (web); 'token' returns a long-lived bearer device token (mobile). */
  mode: z.enum(['session', 'token']).default('session'),
  deviceName: z.string().max(100).optional(),
});

export const createTokenInputSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
  /**
   * Optional project to scope this token to. When set, a default (PAT) token can
   * only see/manipulate todos in this project or ones it created itself.
   * Null/omitted = full-account access (back-compat).
   */
  projectId: z.string().uuid().nullish(),
});

// ---------- Agenda ----------

export const agendaSchema = z.object({
  date: z.string(),
  timezone: z.string(),
  overdue: z.array(todoSchema),
  today: z.array(todoSchema),
  upcoming: z.array(todoSchema),
  summary: z.string(),
});
export type Agenda = z.infer<typeof agendaSchema>;

// ---------- Todo chat (per-todo AI assistant) ----------

export const todoMessageSchema = z.object({
  id: z.string().uuid(),
  todoId: z.string().uuid(),
  role: z.enum(CHAT_ROLES),
  content: z.string(),
  createdAt: z.string(),
});
export type TodoMessage = z.infer<typeof todoMessageSchema>;

export const sendTodoMessageInputSchema = z.object({
  content: z.string().min(1).max(4_000),
});
export type SendTodoMessageInput = z.infer<typeof sendTodoMessageInputSchema>;

/**
 * What one assistant turn cost. Amounts are micro-USD (1e-6 USD) so they stay
 * exact integers — `billed` is the part that fell outside the free allowance.
 */
export const chatUsageSchema = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  priceMicros: z.number().int(),
  billedMicros: z.number().int(),
});
export type ChatUsage = z.infer<typeof chatUsageSchema>;

/** Where the user stands against this month's free allowance. */
export const usageSummarySchema = z.object({
  /** First instant of the current billing month, ISO. */
  periodStart: z.string(),
  billingStatus: z.enum(BILLING_STATUSES),
  freeAllowanceMicros: z.number().int(),
  /** Total marked-up spend this period, free tier included. */
  usedMicros: z.number().int(),
  /** Remaining free allowance; 0 once the allowance is exhausted. */
  remainingFreeMicros: z.number().int(),
  /** Spend beyond the free tier this period — what Stripe is metered for. */
  billedMicros: z.number().int(),
  messageCount: z.number().int(),
  /** True when the allowance is gone and no card is on file, so chat is paused. */
  exhausted: z.boolean(),
});
export type UsageSummary = z.infer<typeof usageSummarySchema>;

// ---------- Briefing ----------

/**
 * Session-start diff for an agent: what changed since this token's last
 * check-in, what's blocked, and what to work on next.
 */
export const briefingSchema = z.object({
  /** ISO instant the diff is computed from (the token's previous use), or null. */
  since: z.string().nullable(),
  timezone: z.string(),
  summary: z.string(),
  completedSinceLastSession: z.array(todoSchema),
  addedSinceLastSession: z.array(todoSchema),
  blocked: z.array(todoSchema),
  overdue: z.array(todoSchema),
  /** Open todos ranked by urgency — the recommended order to start work. */
  nextSteps: z.array(todoSchema),
});
export type Briefing = z.infer<typeof briefingSchema>;
