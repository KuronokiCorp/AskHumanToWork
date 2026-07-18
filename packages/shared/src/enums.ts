export const TODO_STATUSES = ['open', 'doing', 'blocked', 'done', 'cancelled'] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_SOURCES = ['human', 'ai'] as const;
export type TodoSource = (typeof TODO_SOURCES)[number];

export const PRIORITIES = [0, 1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
};

export const REMINDER_CHANNELS = ['email', 'web_push'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_STATUSES = ['pending', 'sent', 'cancelled'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const PROVIDERS = ['ms-todo', 'google-tasks'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const INTEGRATION_STATUSES = ['active', 'error', 'revoked'] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];

export const SYNC_STATUSES = ['synced', 'pending', 'conflict', 'error'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export const CHAT_ROLES = ['user', 'assistant'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

/**
 * AI billing state. 'none' = no card on file, so the user only gets the free
 * monthly allowance; 'active' = card + metered overage subscription;
 * 'past_due' = the last invoice failed, so overage is paused.
 */
export const BILLING_STATUSES = ['none', 'active', 'past_due'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const TOKEN_SCOPES = [
  'todos:read',
  'todos:write',
  'projects:read',
  'integrations:read',
] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];
