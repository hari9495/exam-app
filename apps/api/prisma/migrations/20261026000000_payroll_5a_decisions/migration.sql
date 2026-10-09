-- Payroll batch 5a, founder decisions of 9 Oct 2026 (M03-BUILD-DESIGN §19):
--   D1  a USB-token signed PDF is checked against the document we issued: its unsigned bytes' SHA-256 and length are
--       kept (fixed from issue; the pay_documents_guard trigger lets no column outside its list change).
--   D2  frozen dates refuse attendance and leave changes in the database too, like locked and filed dates (employees use
--       a late request; it is paid in the next payroll).

ALTER TABLE "pay_documents" ADD COLUMN "unsigned_sha256" CHAR(64), ADD COLUMN "unsigned_bytes" INTEGER;
SET LOCAL app.is_super_admin = 'on';
SET LOCAL app.pay_entities = '';
ALTER TABLE "pay_documents" DISABLE TRIGGER "pay_documents_guard";
ALTER TABLE "pay_documents" NO FORCE ROW LEVEL SECURITY;
UPDATE "pay_documents" SET "unsigned_sha256" = "sha256" WHERE "unsigned_sha256" IS NULL;
ALTER TABLE "pay_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "pay_documents" ENABLE TRIGGER "pay_documents_guard";
ALTER TABLE "pay_documents" ALTER COLUMN "unsigned_sha256" SET NOT NULL;

CREATE OR REPLACE FUNCTION yx_time_locked(p_org UUID, p_employee UUID, p_on DATE) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM employee_assignments a
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL
      AND p_on <@ daterange(a.valid_from, a.valid_to, '[]')
      AND pay_period_stage(p_org, a.legal_entity_id, p_on) IN ('frozen', 'locked', 'filed'))
$$;
