-- PPL-38 walkthrough 27 Oct 2026: a permanent disability certificate has no end date. The expiry is optional (the
-- form says so); when given it is still stored and reminded on, since reminders run off expires_on.
ALTER TABLE "document_types" NO FORCE ROW LEVEL SECURITY;
UPDATE "document_types" SET "expiry_tracked" = false WHERE "organization_id" IS NULL AND "key" = 'disability_certificate';
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;
