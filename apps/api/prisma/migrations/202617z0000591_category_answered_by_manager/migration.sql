-- Batch F item 33 (answer 2573): a desk category may be answered by the requester's manager instead of the desk.
-- With no manager the desk answers. A sensitive or private-by-default category is never answered by a manager.
ALTER TABLE "sd_categories" ADD COLUMN "answered_by" VARCHAR(8) NOT NULL DEFAULT 'desk',
  ADD CONSTRAINT "sd_categories_answered_by_check" CHECK ("answered_by" IN ('desk', 'manager')),
  ADD CONSTRAINT "sd_categories_answered_by_confidential_check" CHECK ("answered_by" = 'desk' OR (NOT "sensitive" AND NOT "private_by_default"));
-- The manager who answers this ticket (set at raising from the category; the desk still sees it as a fallback).
ALTER TABLE "sd_tickets" ADD COLUMN "answer_user_id" UUID;
CREATE INDEX "sd_tickets_answer_user_idx" ON "sd_tickets"("organization_id", "answer_user_id") WHERE "answer_user_id" IS NOT NULL;
