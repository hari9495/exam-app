-- Contract labour CL-1 (founder answers 621, 623, 627; docs/yukthix/contract-labour-design-map.md): contractors are the
-- existing vendor record (agencies) with the PF code, ESIC code, LIN, the kind of work and a "supplies contract labour"
-- flag; contractor licences per establishment (our location) with the states they cover, the maximum workers and their
-- validity, a copy of the licence, and a verified renewal (a renewal or a new licence counts only once a person with
-- clra.contractor.manage has verified it); the renewal alerts sent (60, 30 and 7 days by default, setting
-- clra.licence_alerts) so a re-run never sends twice. The law is data: the rule set IN.CLRA for Tamil Nadu and
-- Karnataka, the Contract Labour Act 1970 before 21 Nov 2025 and the OSH Code 2020 from then, all marked verify.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "agencies"
  ADD COLUMN "contract_labour" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "work" VARCHAR(200),
  ADD COLUMN "pf_code" VARCHAR(15),
  ADD COLUMN "esic_code" VARCHAR(17),
  ADD COLUMN "lin" VARCHAR(13);
ALTER TABLE "agencies"
  ADD CONSTRAINT "agencies_pf_code_check" CHECK ("pf_code" IS NULL OR "pf_code" ~ '^[A-Z]{5}[0-9]{7}([0-9]{3})?$'),
  ADD CONSTRAINT "agencies_esic_code_check" CHECK ("esic_code" IS NULL OR "esic_code" ~ '^[0-9]{17}$'),
  ADD CONSTRAINT "agencies_lin_check" CHECK ("lin" IS NULL OR "lin" ~ '^[0-9][0-9-]{8,11}[0-9]$');

CREATE TABLE "contractor_licences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    -- Our establishment the licence is for.
    "location_id" UUID NOT NULL,
    "licence_no" VARCHAR(40) NOT NULL,
    "scope" VARCHAR(200) NOT NULL,
    -- ISO 3166-2 states the licence covers (IN-TN).
    "states" VARCHAR(6)[] NOT NULL,
    "max_workers" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "file_id" UUID NOT NULL,
    -- A renewal points at the licence it renews.
    "renewal_of_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "reject_reason" VARCHAR(500),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_licences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_licences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_renewal_of_id_fkey" FOREIGN KEY ("renewal_of_id") REFERENCES "contractor_licences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contractor_licences_status_check" CHECK ("status" IN ('pending', 'verified', 'rejected')),
    CONSTRAINT "contractor_licences_dates_check" CHECK ("valid_to" >= "valid_from"),
    CONSTRAINT "contractor_licences_max_check" CHECK ("max_workers" BETWEEN 1 AND 100000),
    CONSTRAINT "contractor_licences_states_check" CHECK (cardinality("states") BETWEEN 1 AND 40),
    CONSTRAINT "contractor_licences_decided_check" CHECK (("status" = 'pending') = ("decided_at" IS NULL)),
    CONSTRAINT "contractor_licences_reject_check" CHECK (("status" = 'rejected') = ("reject_reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "contractor_licences_no_key" ON "contractor_licences" ("organization_id", lower("licence_no"), "valid_to") WHERE "status" <> 'rejected';
-- One renewal waiting for verification per licence.
CREATE UNIQUE INDEX "contractor_licences_pending_renewal_key" ON "contractor_licences" ("renewal_of_id") WHERE "status" = 'pending';
CREATE INDEX "contractor_licences_agency_idx" ON "contractor_licences" ("organization_id", "agency_id");
ALTER TABLE "contractor_licences" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contractor_licences"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

CREATE TABLE "contractor_licence_alerts" (
    "organization_id" UUID NOT NULL,
    "licence_id" UUID NOT NULL,
    "days_before" INTEGER NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_licence_alerts_pkey" PRIMARY KEY ("licence_id", "days_before"),
    CONSTRAINT "contractor_licence_alerts_licence_id_fkey" FOREIGN KEY ("licence_id") REFERENCES "contractor_licences"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "contractor_licence_alerts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contractor_licence_alerts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'clra.contractor.manage', 'Contract labour: add and change contractors and their licences, verify or reject licences and renewals'),
  (gen_random_uuid(), 'clra.contractor.view', 'Contract labour: read contractors and their licences'),
  (gen_random_uuid(), 'clra.settings.manage', 'Contract labour: change the company''s contract labour settings (Settings 4.9)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" IN ('clra.contractor.manage', 'clra.contractor.view', 'clra.settings.manage')
ON CONFLICT DO NOTHING;

-- Answer 621: the law as data, per state and date. Thresholds count contract workers of one establishment; the
-- contractor's licence is needed at the same number. All rows marked verify (GO-LIVE-CHECKLIST: counsel).
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify") VALUES
  ('IN.CLRA', 'IN-TN', 'clra-1970-v1', '1971-02-10', '2025-11-20',
   '{"law":"Contract Labour (Regulation and Abolition) Act, 1970","registrationThreshold":20,"licenceThreshold":20,"minAge":18,"licenceBlock":true,"multiStateLicence":false}',
   'Contract Labour (Regulation and Abolition) Act, 1970 s.1(4) (20 or more workmen), s.7 registration, s.12 licence; Tamil Nadu Contract Labour (Regulation and Abolition) Rules, 1975. Verify with counsel before go-live.', true),
  ('IN.CLRA', 'IN-TN', 'osh-2025-v1', '2025-11-21', NULL,
   '{"law":"Occupational Safety, Health and Working Conditions Code, 2020","registrationThreshold":50,"licenceThreshold":50,"minAge":18,"licenceBlock":true,"multiStateLicence":true}',
   'OSH Code, 2020 contract-labour chapter (s.2(1)(t), s.45 to s.47: 50 or more contract labour; a licence may cover one or more states), in force 21 Nov 2025; Tamil Nadu rules as notified. Verify with counsel before go-live.', true),
  ('IN.CLRA', 'IN-KA', 'clra-1970-v1', '1971-02-10', '2025-11-20',
   '{"law":"Contract Labour (Regulation and Abolition) Act, 1970","registrationThreshold":20,"licenceThreshold":20,"minAge":18,"licenceBlock":true,"multiStateLicence":false}',
   'Contract Labour (Regulation and Abolition) Act, 1970 s.1(4) (20 or more workmen), s.7 registration, s.12 licence; Karnataka Contract Labour (Regulation and Abolition) Rules, 1974. Verify with counsel before go-live.', true),
  ('IN.CLRA', 'IN-KA', 'osh-2025-v1', '2025-11-21', NULL,
   '{"law":"Occupational Safety, Health and Working Conditions Code, 2020","registrationThreshold":50,"licenceThreshold":50,"minAge":18,"licenceBlock":true,"multiStateLicence":true}',
   'OSH Code, 2020 contract-labour chapter (s.2(1)(t), s.45 to s.47: 50 or more contract labour; a licence may cover one or more states), in force 21 Nov 2025; Karnataka rules as notified. Verify with counsel before go-live.', true);
