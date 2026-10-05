-- AlterTable
-- Nullable erasure marker for GDPR right-to-erasure (Phase 6d): set once when a candidate's
-- PII is anonymized in place. Provides idempotency for the erase endpoint and a rejection
-- flag so an erased candidate cannot be re-invited.
ALTER TABLE [dbo].[candidates] ADD [erased_at] DATETIME2;
