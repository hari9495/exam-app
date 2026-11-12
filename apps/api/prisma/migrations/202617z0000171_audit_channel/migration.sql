-- Settings S-5 follow-up, founder answer 1723: record where each audit entry came from (web, phone, or the public API),
-- from now on. The app sets `app.channel` with every tenant transaction of a request; the column takes it by default,
-- so every writer records it without change. Rows written before, and by jobs, have none (shown as nothing).
-- Schema only. The column is outside the hash chain (it is not part of what was done); the append-only trigger still
-- refuses any change to it after the row is written.
ALTER TABLE "audit_logs" ADD COLUMN "channel" VARCHAR(8) DEFAULT NULLIF(current_setting('app.channel', true), '');
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_channel_check" CHECK ("channel" IS NULL OR "channel" IN ('web', 'phone', 'api'));
