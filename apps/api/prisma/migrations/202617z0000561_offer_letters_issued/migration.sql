-- Answers 2515 / 2524 next step (M10 D4): an offer is issued as a real P05 letter. A candidate is not a person yet, so a
-- letter is for exactly one of a person or a candidate (offer letters: subject_type 'offer', subject_id the offer).
ALTER TABLE "letter_issues" ALTER COLUMN "person_id" DROP NOT NULL;
ALTER TABLE "letter_issues" ADD COLUMN "candidate_id" UUID;
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_candidate_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id");
ALTER TABLE "letter_issues" ADD CONSTRAINT "letter_issues_one_recipient" CHECK (("person_id" IS NULL) <> ("candidate_id" IS NULL));
CREATE INDEX "letter_issues_candidate_idx" ON "letter_issues" ("organization_id", "candidate_id");
CREATE INDEX "letter_issues_subject_idx" ON "letter_issues" ("organization_id", "subject_type", "subject_id");

-- The guard of 20261209000000_letter_employment, plus: an issued letter's candidate never changes either.
CREATE OR REPLACE FUNCTION letter_issues_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('issued', 'superseded') THEN
    IF NEW.file_id IS DISTINCT FROM OLD.file_id OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.reference_no IS DISTINCT FROM OLD.reference_no
       OR NEW.verify_code IS DISTINCT FROM OLD.verify_code OR NEW.data_enc IS DISTINCT FROM OLD.data_enc OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.signature_ref IS DISTINCT FROM OLD.signature_ref THEN
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
