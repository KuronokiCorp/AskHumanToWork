CREATE TYPE "chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "billing_status" AS ENUM('none', 'active', 'past_due');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_subscription_item_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_status" "billing_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "todo_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"todo_id" uuid NOT NULL REFERENCES "todos"("id") ON DELETE cascade,
	"owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todo_messages_todo_idx" ON "todo_messages" ("todo_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"todo_id" uuid REFERENCES "todos"("id") ON DELETE set null,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"price_micros" integer DEFAULT 0 NOT NULL,
	"billed_micros" integer DEFAULT 0 NOT NULL,
	"reported_to_stripe" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_owner_idx" ON "ai_usage_events" ("owner_id","created_at");
