CREATE TABLE "web_sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "web_sessions_expires_idx" ON "web_sessions" USING btree ("expires_at");