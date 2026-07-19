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
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant']);
// AI billing state: 'none' = no card, only the free monthly allowance;
// 'active' = card on file + metered overage subscription; 'past_due' = last invoice failed.
export const billingStatusEnum = pgEnum('billing_status', ['none', 'active', 'past_due']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  // Null for accounts that only ever signed in through an OAuth provider —
  // they have no password to compare against, and must not be able to log in
  // through the password route at all.
  passwordHash: text('password_hash'),
  timezone: text('timezone').notNull().default('UTC'),
  // { channels: { email: true, web_push: true }, quietHours: { start: "22:00", end: "08:00" } }
  notificationPrefs: jsonb('notification_prefs')
    .notNull()
    .default(sql`'{"channels":{"email":true,"web_push":true},"quietHours":null}'::jsonb`),
  isAdmin: boolean('is_admin').notNull().default(false),
  // Entitlements: third-party integrations (MS To Do / Google Tasks sync) are pro-only.
  plan: planEnum('plan').notNull().default('free'),
  // --- AI feature billing (per-todo assistant, metered pay-as-you-go over a free tier) ---
  stripeCustomerId: text('stripe_customer_id'),
  // Subscription item on the metered "AI usage" price; usage is reported against it.
  stripeSubscriptionItemId: text('stripe_subscription_item_id'),
  billingStatus: billingStatusEnum('billing_status').notNull().default('none'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Per-todo AI assistant conversation. Loaded as history when the user reopens
// a todo's chat; sent to the model as context on each new message.
export const todoMessages = pgTable(
  'todo_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    todoId: uuid('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: chatRoleEnum('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('todo_messages_todo_idx').on(t.todoId, t.createdAt)],
);

// Usage ledger for the AI assistant — one row per model call. Source of truth
// for "people can see their usage" and for the monthly free-tier meter.
// priceMicros is the marked-up (billable) amount in micro-USD; costMicros is
// our raw MiniMax cost. Both stored for transparency + margin reporting.
export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    todoId: uuid('todo_id').references(() => todos.id, { onDelete: 'set null' }),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    // our raw provider cost, and the marked-up amount billed to the user (micro-USD)
    costMicros: integer('cost_micros').notNull().default(0),
    priceMicros: integer('price_micros').notNull().default(0),
    // micro-USD of this event that fell OUTSIDE the free tier (what Stripe is billed)
    billedMicros: integer('billed_micros').notNull().default(0),
    // true once reported to Stripe's meter (or n/a when billedMicros = 0)
    reportedToStripe: boolean('reported_to_stripe').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_owner_idx').on(t.ownerId, t.createdAt)],
);

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
