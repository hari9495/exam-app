-- Accessibility menu choices per person (answers 2330 to 2334). The users table already has RLS.
ALTER TABLE "users" ADD COLUMN "accessibility" JSONB;
