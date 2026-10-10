-- Lifecycle batch 6b (M01-LIFECYCLE-BUILD-DESIGN §5.3): the pre-boarding portal (OTP sessions, the joiner's own
-- sealed answers), BGV consent and checks, Word letter templates, issued letters with gap-free numbers and a verify
-- code (payroll 5a's pattern), OTP e-sign, company signatories. Every table: forced RLS + tenant_isolation.

-- ---------------------------------------------------------------------------------------------- joiners
ALTER TABLE "preboardings"
  ADD COLUMN "offer_id" UUID,
  ADD COLUMN "answers_enc" TEXT,
  ADD COLUMN "sections" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "completion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outcome" VARCHAR(16),
  ADD COLUMN "outcome_reason" VARCHAR(500),
  ADD COLUMN "identity_attested_by" UUID,
  ADD COLUMN "identity_attested_at" TIMESTAMPTZ(3),
  ADD COLUMN "reminded_on" DATE,
  ADD COLUMN "joined_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "preboardings_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('did_not_join', 'reneged', 'withdrawn')),
  ADD CONSTRAINT "preboardings_cancel_check" CHECK ("status" <> 'cancelled' OR ("outcome" IS NOT NULL AND "outcome_reason" IS NOT NULL)),
  ADD CONSTRAINT "preboardings_completion_check" CHECK ("completion" BETWEEN 0 AND 100),
  ADD CONSTRAINT "preboardings_attested_fkey" FOREIGN KEY ("organization_id", "identity_attested_by") REFERENCES "users"("organization_id", "id");
-- One joiner per accepted offer.
CREATE UNIQUE INDEX "preboardings_offer_key" ON "preboardings" ("organization_id", "offer_id") WHERE "offer_id" IS NOT NULL AND "status" <> 'cancelled';

CREATE TABLE "preboarding_portal_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "preboarding_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "stepped_up_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "preboarding_portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "preboarding_portal_sessions_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "preboarding_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "preboarding_portal_sessions_preboarding_fkey" FOREIGN KEY ("organization_id", "preboarding_id") REFERENCES "preboardings"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "preboarding_portal_sessions" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- BGV (DPDP consent)
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "notice_version" VARCHAR(20) NOT NULL,
    "items_shown" JSONB NOT NULL,
    "given_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consent_records_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "consent_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "consent_records_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "consent_records_purpose_check" CHECK ("purpose" IN ('bgv', 'esign'))
);
CREATE UNIQUE INDEX "consent_records_live_key" ON "consent_records" ("organization_id", "person_id", "purpose") WHERE "withdrawn_at" IS NULL;
-- Evidence of consent is kept as given: only the withdrawal time may be set, once.
REVOKE DELETE, TRUNCATE ON TABLE "consent_records" FROM app_runtime;
CREATE FUNCTION consent_records_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.notice_version IS DISTINCT FROM OLD.notice_version
     OR NEW.items_shown IS DISTINCT FROM OLD.items_shown OR NEW.given_at IS DISTINCT FROM OLD.given_at OR NEW.evidence IS DISTINCT FROM OLD.evidence
     OR (OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at) THEN
    RAISE EXCEPTION 'A consent record is kept as given' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consent_records_guard BEFORE UPDATE ON "consent_records" FOR EACH ROW EXECUTE FUNCTION consent_records_guard();

CREATE TABLE "bgv_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "preboarding_id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "check_type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "gate" VARCHAR(20) NOT NULL DEFAULT 'none',
    "result_document_id" UUID,
    "note" VARCHAR(1000),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bgv_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bgv_checks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bgv_checks_preboarding_fkey" FOREIGN KEY ("organization_id", "preboarding_id") REFERENCES "preboardings"("organization_id", "id"),
    CONSTRAINT "bgv_checks_consent_fkey" FOREIGN KEY ("organization_id", "consent_id") REFERENCES "consent_records"("organization_id", "id"),
    CONSTRAINT "bgv_checks_document_fkey" FOREIGN KEY ("organization_id", "result_document_id") REFERENCES "documents"("organization_id", "id"),
    CONSTRAINT "bgv_checks_type_check" CHECK ("check_type" IN ('identity', 'address', 'education', 'employment', 'criminal', 'reference', 'credit')),
    CONSTRAINT "bgv_checks_status_check" CHECK ("status" IN ('requested', 'in_progress', 'clear', 'discrepancy', 'unable', 'cancelled')),
    CONSTRAINT "bgv_checks_gate_check" CHECK ("gate" IN ('none', 'before_joining', 'before_confirmation'))
);
REVOKE DELETE, TRUNCATE ON TABLE "bgv_checks" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- letters (P05 §4.3)
CREATE TABLE "letter_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "letter_type" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "legal_entity_id" UUID,
    "language" VARCHAR(5) NOT NULL DEFAULT 'en',
    "source" VARCHAR(8) NOT NULL,
    "file_id" UUID NOT NULL,
    "fields" TEXT[] NOT NULL DEFAULT '{}',
    "requires_approval" BOOLEAN NOT NULL,
    "person_signs" BOOLEAN NOT NULL,
    "company_dsc" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(10) NOT NULL,
    "preview_viewed_by" UUID,
    "preview_viewed_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "letter_templates_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "letter_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "letter_templates_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "letter_templates_file_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "files"("organization_id", "id"),
    CONSTRAINT "letter_templates_type_check" CHECK ("letter_type" ~ '^[a-z][a-z0-9_]{1,39}$'),
    CONSTRAINT "letter_templates_source_check" CHECK ("source" IN ('upload', 'starter')),
    CONSTRAINT "letter_templates_status_check" CHECK ("status" IN ('draft', 'active', 'retired')),
    -- YX-DOC-15: a template is active only after its sample preview was seen.
    CONSTRAINT "letter_templates_preview_check" CHECK ("status" <> 'active' OR "preview_viewed_at" IS NOT NULL)
);
-- One active template per type, entity and language.
CREATE UNIQUE INDEX "letter_templates_active_key" ON "letter_templates" ("organization_id", "letter_type", COALESCE("legal_entity_id", '00000000-0000-0000-0000-000000000000'::uuid), "language") WHERE "status" = 'active';
REVOKE DELETE, TRUNCATE ON TABLE "letter_templates" FROM app_runtime;

CREATE TABLE "letter_counters" (
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "letter_type" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL,
    CONSTRAINT "letter_counters_pkey" PRIMARY KEY ("organization_id", "legal_entity_id", "letter_type", "year"),
    CONSTRAINT "letter_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "letter_counters_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "letter_counters" FROM app_runtime;

CREATE TABLE "signatories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "signature_file_id" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "signatories_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "signatories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "signatories_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "signatories_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "signatories_file_fkey" FOREIGN KEY ("organization_id", "signature_file_id") REFERENCES "files"("organization_id", "id")
);
CREATE UNIQUE INDEX "signatories_live_key" ON "signatories" ("organization_id", "legal_entity_id", "user_id") WHERE "active";
REVOKE DELETE, TRUNCATE ON TABLE "signatories" FROM app_runtime;

CREATE TABLE "letter_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "letter_type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "person_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "subject_type" VARCHAR(12),
    "subject_id" UUID,
    "reference_no" VARCHAR(60),
    "data_enc" TEXT NOT NULL,
    "file_id" UUID,
    "unsigned_sha256" CHAR(64),
    "unsigned_bytes" INTEGER,
    "sha256" CHAR(64),
    "signature_ref" VARCHAR(200),
    "verify_code" VARCHAR(16),
    "status" VARCHAR(20) NOT NULL,
    "wf_request_id" UUID,
    "supersedes_id" UUID,
    "superseded_by_id" UUID,
    "signatory_id" UUID,
    "person_signs" BOOLEAN NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "acceptance_file_id" UUID,
    "render_error" VARCHAR(300),
    "requested_by" UUID,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "letter_issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "letter_issues_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "letter_issues_verify_key" UNIQUE ("verify_code"),
    CONSTRAINT "letter_issues_ref_key" UNIQUE ("organization_id", "legal_entity_id", "letter_type", "reference_no"),
    CONSTRAINT "letter_issues_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "letter_issues_template_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "letter_templates"("organization_id", "id"),
    CONSTRAINT "letter_issues_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "letter_issues_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "letter_issues_file_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "files"("organization_id", "id"),
    CONSTRAINT "letter_issues_acceptance_fkey" FOREIGN KEY ("organization_id", "acceptance_file_id") REFERENCES "files"("organization_id", "id"),
    CONSTRAINT "letter_issues_supersedes_fkey" FOREIGN KEY ("organization_id", "supersedes_id") REFERENCES "letter_issues"("organization_id", "id"),
    CONSTRAINT "letter_issues_signatory_fkey" FOREIGN KEY ("organization_id", "signatory_id") REFERENCES "signatories"("organization_id", "id"),
    CONSTRAINT "letter_issues_status_check" CHECK ("status" IN ('pending_approval', 'rejected', 'rendering', 'awaiting_signature', 'issued', 'superseded', 'withdrawn')),
    CONSTRAINT "letter_issues_issued_check" CHECK ("status" NOT IN ('issued', 'superseded') OR ("file_id" IS NOT NULL AND "sha256" IS NOT NULL AND "reference_no" IS NOT NULL AND "verify_code" IS NOT NULL AND "issued_at" IS NOT NULL))
);
CREATE INDEX "letter_issues_person_idx" ON "letter_issues" ("organization_id", "person_id", "created_at" DESC);
REVOKE DELETE, TRUNCATE ON TABLE "letter_issues" FROM app_runtime;
-- YX-DOC-09: an issued letter never changes. Allowed moves: rendering → awaiting_signature / issued (the file, hash,
-- number and code set once); awaiting_signature → issued (the signed file replaces the unsigned one, once);
-- issued → superseded (once, naming its successor); the person's acceptance is recorded once.
CREATE FUNCTION letter_issues_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  RETURN NEW;
END $$;
CREATE TRIGGER letter_issues_guard BEFORE UPDATE ON "letter_issues" FOR EACH ROW EXECUTE FUNCTION letter_issues_guard();

CREATE TABLE "signature_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "letter_issue_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "method" VARCHAR(12) NOT NULL DEFAULT 'click_otp',
    "status" VARCHAR(10) NOT NULL,
    "evidence" JSONB,
    "decline_reason" VARCHAR(500),
    "signed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "signature_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "signature_requests_letter_fkey" FOREIGN KEY ("organization_id", "letter_issue_id") REFERENCES "letter_issues"("organization_id", "id"),
    CONSTRAINT "signature_requests_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "signature_requests_status_check" CHECK ("status" IN ('open', 'signed', 'declined', 'cancelled')),
    CONSTRAINT "signature_requests_method_check" CHECK ("method" IN ('click_otp'))
);
CREATE UNIQUE INDEX "signature_requests_letter_key" ON "signature_requests" ("organization_id", "letter_issue_id", "person_id");
REVOKE DELETE, TRUNCATE ON TABLE "signature_requests" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- journeys
ALTER TABLE "journey_tasks" DROP CONSTRAINT "journey_tasks_status_check";
ALTER TABLE "journey_tasks" ADD CONSTRAINT "journey_tasks_status_check" CHECK ("status" IN ('waiting', 'open', 'done', 'skipped', 'cancelled'));

-- ---------------------------------------------------------------------------------------------- system document type
ALTER TABLE "document_types" NO FORCE ROW LEVEL SECURITY;
INSERT INTO "document_types" ("organization_id", "key", "name", "sensitivity", "requires_verification", "allowed_mime", "max_mb", "expiry_tracked", "reminder_days", "upload_by") VALUES
  (NULL, 'bgv_report', 'Background check report', 'special', false, ARRAY['application/pdf', 'image/jpeg', 'image/png'], 10, false, '{}', ARRAY['hr']);
ALTER TABLE "document_types" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------------------------- RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['preboarding_portal_sessions', 'consent_records', 'bgv_checks', 'letter_templates', 'letter_counters', 'letter_issues', 'signature_requests', 'signatories']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  -- P02 Q8: YukthiX support never reads a person's consents, background checks, letters or signatures.
  FOREACH t IN ARRAY ARRAY['preboarding_portal_sessions', 'consent_records', 'bgv_checks', 'letter_issues', 'signature_requests']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------- permission keys (§6)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'lifecycle.bgv.manage', 'See and record background checks and the consent behind them for joiners in scope (Special data)'),
  (gen_random_uuid(), 'letter.template.manage', 'Upload, check and switch on Word letter templates'),
  (gen_random_uuid(), 'letter.issue', 'Issue letters to the people in scope (letter types that need approval go to the signatory first)'),
  (gen_random_uuid(), 'letter.signatory.manage', 'Name who signs letters for each legal entity and their signature image (needs a fresh second sign-in step)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('letter.template.manage', 'letter.signatory.manage')
ON CONFLICT DO NOTHING;
