-- OAuth-only accounts have no password to store. Idempotent: dropping NOT NULL
-- on an already-nullable column is a no-op, matching how 0006/0007 are written.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
