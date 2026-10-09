-- Service Desk 3b-2 batch 3, founder decisions of 9 Oct 2026:
--   routing waits for the best-matched agent for a desk-set time (default 2 minutes) before it falls back;
--   a contact's saved language (WhatsApp / SMS / chat tickets use it before guessing from the first message).
ALTER TABLE "sd_desks" ADD COLUMN "routing_wait_minutes" SMALLINT NOT NULL DEFAULT 2,
  ADD CONSTRAINT "sd_desks_routing_wait_minutes_check" CHECK ("routing_wait_minutes" BETWEEN 0 AND 60);
-- Set while a new ticket waits for its best-matched agent; the one-minute desk sweep assigns or falls back.
ALTER TABLE "sd_tickets" ADD COLUMN "routing_wait_until" TIMESTAMPTZ(3);
CREATE INDEX "sd_tickets_routing_wait_idx" ON "sd_tickets" ("routing_wait_until") WHERE "routing_wait_until" IS NOT NULL;
ALTER TABLE "sd_requester_flags" ADD COLUMN "language" VARCHAR(8),
  ADD CONSTRAINT "sd_requester_flags_language_check" CHECK ("language" IS NULL OR "language" ~ '^[a-z]{2,3}$');
