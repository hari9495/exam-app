-- Founder decision 5f-D1 (10 Oct 2026; M03 §19.8): the quarterly TDS return is written in the official e-TDS format and
-- validated by the government's File Validation Utility in an isolated worker. The return keeps what the validator said
-- (which validator, the outcome, the errors, the hashes) and is "validated" before it can be marked filed.
ALTER TABLE "tds_returns" ADD COLUMN "fvu" JSONB;
ALTER TABLE "tds_returns" DROP CONSTRAINT "tds_returns_status_check";
ALTER TABLE "tds_returns" ADD CONSTRAINT "tds_returns_status_check" CHECK ("status" IN ('draft', 'reconciled', 'validated', 'filed'));
