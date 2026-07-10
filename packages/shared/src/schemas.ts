import { z } from 'zod';
import {
  TODO_STATUSES,
  TODO_SOURCES,
  REMINDER_CHANNELS,
  PROVIDERS,
  TOKEN_SCOPES,
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
  priority: z.number().int().min(0).max(3),
  source: z.enum(TODO_SOURCES),
  createdByAgent: z.string().nullable(),
  originContext: z.string().nullable(),
  tags: z.array(z.string()),
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
  /** Absolute ISO 8601 due date. Used only if dueNatural is absent. */
  dueAt: z.string().datetime({ offset: true }).optional(),
  /** Project name; fuzzy-matched, created if new. */
  project: z.string().max(100).optional(),
  priority: z.number().int().min(0).max(3).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  /** Explicit reminder times (ISO or natural). If omitted, a default ladder is derived from dueAt. */
  reminders: z.array(z.string()).max(10).optional(),
  /** Why this todo exists — REQUIRED provenance for AI-created todos. */
  originContext: z.string().max(500).optional(),
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
