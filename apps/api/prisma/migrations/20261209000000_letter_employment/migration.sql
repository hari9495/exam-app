-- PPL-28 (coordinator 26 Oct 2026): "one per person" letters count per employment, so a rehire gets a new appointment,
-- relieving or experience letter for the new job. A letter remembers the employment it is for: the current one when it is
-- asked for; none yet while the person is joining (linked when the employment is made). Once set, it never changes.
ALTER TABLE "letter_issues" ADD COLUMN "employment_id" UUID;
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id");
CREATE INDEX "letter_issues_person_type_idx" ON "letter_issues" ("organization_id", "person_id", "letter_type");

-- Backfill: the employment current when the letter was asked for; before joining (preboarding), the one that followed;
-- otherwise the last one that had ended, or else the first that followed.
ALTER TABLE "letter_issues" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "letter_issues" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "employments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "employments" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "employees" DISABLE ROW LEVEL SECURITY;
WITH s AS (
  SELECT e."id", e."organization_id", p."person_id", e."joined_on", e."exited_on"
  FROM "employments" e JOIN "employees" p ON p."organization_id" = e."organization_id" AND p."id" = e."employee_id"
)
UPDATE "letter_issues" l SET "employment_id" = COALESCE(
  (SELECT s."id" FROM s WHERE s."organization_id" = l."organization_id" AND s."person_id" = l."person_id" AND s."joined_on" <= l."created_at"::date AND (s."exited_on" IS NULL OR s."exited_on" >= l."created_at"::date) ORDER BY s."joined_on" DESC LIMIT 1),
  CASE WHEN l."subject_type" = 'preboarding' THEN (SELECT s."id" FROM s WHERE s."organization_id" = l."organization_id" AND s."person_id" = l."person_id" AND s."joined_on" > l."created_at"::date ORDER BY s."joined_on" ASC LIMIT 1) END,
  (SELECT s."id" FROM s WHERE s."organization_id" = l."organization_id" AND s."person_id" = l."person_id" AND s."exited_on" < l."created_at"::date ORDER BY s."joined_on" DESC LIMIT 1),
  (SELECT s."id" FROM s WHERE s."organization_id" = l."organization_id" AND s."person_id" = l."person_id" ORDER BY s."joined_on" ASC LIMIT 1)
);
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "employments" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "letter_issues" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION letter_issues_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('issued', 'superseded') THEN
    IF NEW.file_id IS DISTINCT FROM OLD.file_id OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.reference_no IS DISTINCT FROM OLD.reference_no
       OR NEW.verify_code IS DISTINCT FROM OLD.verify_code OR NEW.data_enc IS DISTINCT FROM OLD.data_enc OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.signature_ref IS DISTINCT FROM OLD.signature_ref THEN
      RAISE EXCEPTION 'An issued letter never changes' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> OLD.status AND NOT (OLD.status = 'issued' AND NEW.status = 'superseded' AND NEW.superseded_by_id IS NOT NULL) THEN
      RAISE EXCEPTION 'An issued letter can only be superseded' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.accepted_at IS NOT NULL AND (NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.acceptance_file_id IS DISTINCT FROM OLD.acceptance_file_id) THEN
      RAISE EXCEPTION 'An acceptance is recorded once' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF OLD.reference_no IS NOT NULL AND NEW.reference_no IS DISTINCT FROM OLD.reference_no THEN
    RAISE EXCEPTION 'A reference number never changes' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.employment_id IS NOT NULL AND NEW.employment_id IS DISTINCT FROM OLD.employment_id THEN
    RAISE EXCEPTION 'A letter''s employment never changes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
