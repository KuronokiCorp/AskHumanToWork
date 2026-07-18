ALTER TYPE "todo_status" ADD VALUE IF NOT EXISTS 'blocked' BEFORE 'done';--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "blocked_reason" text;
