import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  smallint,
  jsonb,
  index,
  uniqueIndex,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const todoStatusEnum = pgEnum('todo_status', ['open', 'doing', 'blocked', 'done', 'cancelled']);
export const todoSourceEnum = pgEnum('todo_source', ['human', 'ai']);
export const reminderChannelEnum = pgEnum('reminder_channel', ['email', 'web_push']);
export const reminderStatusEnum = pgEnum('reminder_status', ['pending', 'sent', 'cancelled']);
export const providerEnum = pgEnum('provider', ['ms-todo', 'google-tasks']);
export const integrationStatusEnum = pgEnum('integration_status', ['active', 'error', 'revoked']);
export const syncStatusEnum = pgEnum('sync_status', ['synced', 'pending', 'conflict', 'error']);
export const syncDirectionEnum = pgEnum('sync_direction', ['outbound', 'inbound']);
export const syncJobStatusEnum = pgEnum('sync_job_status', ['queued', 'running', 'done', 'failed']);
export const planEnum = pgEnum('plan', ['free', 'pro']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  // { channels: { email: true, web_push: true }, quietHours: { start: "22:00", end: "08:00" } }
  notificationPrefs: jsonb('notification_prefs')
    .notNull()
    .default(sql`'{"channels":{"email":true,"web_push":true},"quietHours":null}'::jsonb`),
  isAdmin: boolean('is_admin').notNull().default(false),
  // Entitlements: third-party integrations (MS To Do / Google Tasks sync) are pro-only.
  plan: planEnum('plan').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('projects_owner_name_idx').on(t.ownerId, t.name)],
);

export const todos = pgTable(
  'todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    notes: text('notes'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    status: todoStatusEnum('status').notNull().default('open'),
    // Why this todo can't proceed; set alongside status 'blocked'.
    blockedReason: text('blocked_reason'),
    priority: smallint('priority').notNull().default(0),
    source: todoSourceEnum('source').notNull().default('human'),
    // What the client reported it is (x-agent-name header), e.g. "claude-code".
    createdByAgent: text('created_by_agent'),
    // Authoritative source: the NAME of the API token used (the device/app the
    // user named when creating it, e.g. "MacBook Claude Code"). Server-set.
    createdByToken: text('created_by_token'),
    originContext: text('origin_context'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    // RRULE-lite JSON ({freq, interval, byWeekday?, display}); completing spawns next occurrence
    recurrence: jsonb('recurrence'),
    // sha256(title|dueAt|projectId) for idempotent agent retries
    dedupHash: text('dedup_hash'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('todos_owner_status_idx').on(t.ownerId, t.status),
    index('todos_owner_due_idx').on(t.ownerId, t.dueAt),
    index('todos_dedup_idx').on(t.ownerId, t.dedupHash, t.createdAt),
    // full-text search over title + notes
    index('todos_fts_idx').using(
      'gin',
      sql`to_tsvector('simple', coalesce(${t.title}, '') || ' ' || coalesce(${t.notes}, ''))`,
    ),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    todoId: uuid('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
    channel: reminderChannelEnum('channel').notNull(),
    status: reminderStatusEnum('status').notNull().default('pending'),
    // 'ladder' reminders are auto-derived from dueAt and recomputed on due change
    kind: text('kind').notNull().default('ladder'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reminders_todo_idx').on(t.todoId), index('reminders_fire_idx').on(t.status, t.fireAt)],
);

export const agentTokens = pgTable(
  'agent_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: text('scopes').array().notNull(),
    // Optional project this token is scoped to. When set, a default (pat) token
    // may only see/manipulate todos in this project or ones it created itself.
    // null = full-account access.
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    // 'pat' for MCP/API tokens, 'device' for mobile login tokens
    kind: text('kind').notNull().default('pat'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('agent_tokens_user_idx').on(t.userId)],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  keys: jsonb('keys').notNull(), // { p256dh, auth }
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: providerEnum('provider').notNull(),
    // AES-256-GCM encrypted JSON: { accessToken, refreshToken, expiresAt }
    oauthTokensEnc: text('oauth_tokens_enc').notNull(),
    status: integrationStatusEnum('status').notNull().default('active'),
    // { defaultListId, defaultListName, direction: 'outbound'|'two-way',
    //   filters: { minPriority?, sourceOnly?, requireDueDate? }, projectRouting: { [projectId]: listId } }
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    // provider-side incremental sync cursor (e.g. Graph deltaLink / Tasks updatedMin)
    syncCursor: text('sync_cursor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('integrations_user_provider_idx').on(t.userId, t.provider)],
);

export const todoLinks = pgTable(
  'todo_links',
  {
    todoId: uuid('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    externalListId: text('external_list_id'),
    etag: text('etag'),
    lastPushedHash: text('last_pushed_hash'),
    syncStatus: syncStatusEnum('sync_status').notNull().default('pending'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.todoId, t.integrationId] }),
    index('todo_links_external_idx').on(t.integrationId, t.externalId),
  ],
);

export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    todoId: uuid('todo_id').references(() => todos.id, { onDelete: 'cascade' }),
    direction: syncDirectionEnum('direction').notNull().default('outbound'),
    // 'create' | 'update' | 'complete' | 'delete'
    action: text('action').notNull(),
    payload: jsonb('payload'),
    status: syncJobStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_jobs_status_idx').on(t.status, t.nextRetryAt)],
);

// Web session store (Postgres-backed so sessions survive restarts; no Redis).
export const webSessions = pgTable(
  'web_sessions',
  {
    sid: text('sid').primaryKey(),
    data: jsonb('data').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('web_sessions_expires_idx').on(t.expiresAt)],
);

export const providerCredentials = pgTable('provider_credentials', {
  provider: providerEnum('provider').primaryKey(),
  clientId: text('client_id').notNull(),
  clientSecretEnc: text('client_secret_enc').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
