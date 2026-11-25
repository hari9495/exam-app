-- The founder's "later" list, offers and interviews (11 Nov 2026).
-- 377: the sealed copy of an e-signed offer (the letter and the signing evidence), a private file.
ALTER TABLE "offers" ADD COLUMN "acceptance_file_id" UUID;
ALTER TABLE "offers" ADD CONSTRAINT "offers_acceptance_file_fkey" FOREIGN KEY ("acceptance_file_id") REFERENCES "files"("id") ON DELETE RESTRICT;
-- 401: a bulk offer batch can name the People joiner batch its accepted offers join (same legal entity and joining day).
ALTER TABLE "offer_batches" ADD COLUMN "joiner_batch_id" UUID;
ALTER TABLE "offer_batches" ADD CONSTRAINT "offer_batches_joiner_batch_fkey" FOREIGN KEY ("organization_id", "joiner_batch_id") REFERENCES "joiner_batches"("organization_id", "id") ON DELETE RESTRICT;
-- 421: WhatsApp reminders 2 hours before each slot: the day's switch, and each row's result (never silent).
ALTER TABLE "interview_days" ADD COLUMN "whatsapp_reminders" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "interview_day_rows" ADD COLUMN "reminder_at" TIMESTAMPTZ(3);
ALTER TABLE "interview_day_rows" ADD COLUMN "reminder_status" VARCHAR(14);
ALTER TABLE "interview_day_rows" ADD CONSTRAINT "interview_day_rows_reminder_check" CHECK ("reminder_status" IS NULL OR "reminder_status" IN ('sent', 'failed', 'not_opted_in', 'no_phone', 'not_connected'));
