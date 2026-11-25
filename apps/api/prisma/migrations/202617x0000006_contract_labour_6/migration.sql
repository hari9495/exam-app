-- Contract labour CL-6 (CLB-04, founder answers 629, 630): the contract-labour registers and the annual return.
-- The register formats are rule-set data (IN.CLRA.REGISTERS per state, marked verify). The registers are versions in
-- statutory_registers (register types clra_*), built monthly per establishment from the deployments, the contractors'
-- wage registers (CL-4) and, until CL-5 lands, the days in those wage registers; frozen and signed with the company DSC
-- through the payroll registers service. The annual return is drafted in YukthiX; filing on the portal stays manual,
-- and the filed date and reference are recorded here.

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify") VALUES
  ('IN.CLRA.REGISTERS', 'IN-TN', 'osh-2025-v1', '2025-11-21', NULL,
   '{"registers":[{"type":"clra_contractors","title":"Register of contractors","columns":["Sl. no.","Contractor","Nature of work","Licence no.","Licence valid to","Licence maximum","Workers in the month"]},{"type":"clra_workmen","title":"Register of contract workers","columns":["Sl. no.","Name","Contractor","Skill","ID (last 4)","UAN","From","To"]},{"type":"clra_muster","title":"Muster roll of contract workers","columns":["Sl. no.","Name","Contractor","Days worked"]},{"type":"clra_wages","title":"Register of wages of contract workers","columns":["Sl. no.","Name","Contractor","Days worked","Wages paid","Paid on"]}],"annualReturn":{"title":"Annual return of the principal employer","due":"02-15"}}',
   'OSH Code, 2020 contract-labour chapter and the Tamil Nadu rules as notified (registers of contractors and contract labour, muster roll, wages; annual return by 15 February). Form numbers to verify with counsel before go-live.', true),
  ('IN.CLRA.REGISTERS', 'IN-KA', 'osh-2025-v1', '2025-11-21', NULL,
   '{"registers":[{"type":"clra_contractors","title":"Register of contractors","columns":["Sl. no.","Contractor","Nature of work","Licence no.","Licence valid to","Licence maximum","Workers in the month"]},{"type":"clra_workmen","title":"Register of contract workers","columns":["Sl. no.","Name","Contractor","Skill","ID (last 4)","UAN","From","To"]},{"type":"clra_muster","title":"Muster roll of contract workers","columns":["Sl. no.","Name","Contractor","Days worked"]},{"type":"clra_wages","title":"Register of wages of contract workers","columns":["Sl. no.","Name","Contractor","Days worked","Wages paid","Paid on"]}],"annualReturn":{"title":"Annual return of the principal employer","due":"02-15"}}',
   'OSH Code, 2020 contract-labour chapter and the Karnataka rules as notified (registers of contractors and contract labour, muster roll, wages; annual return by 15 February). Form numbers to verify with counsel before go-live.', true);

-- Answer 630: the annual return per establishment and year, recorded when filed on the portal (by hand).
CREATE TABLE "clra_annual_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    -- What was filed: the drafted figures at the time (contractors, maximum workers on a day, days worked).
    "figures" JSONB NOT NULL,
    "format_version" VARCHAR(20) NOT NULL,
    "filed_on" DATE NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "filed_by" UUID NOT NULL,
    "filed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clra_annual_returns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clra_annual_returns_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "clra_annual_returns_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
    CONSTRAINT "clra_annual_returns_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
    CONSTRAINT "clra_annual_returns_reference_check" CHECK (char_length(btrim("reference")) BETWEEN 3 AND 60)
);
CREATE UNIQUE INDEX "clra_annual_returns_key" ON "clra_annual_returns" ("organization_id", "location_id", "year");
ALTER TABLE "clra_annual_returns" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clra_annual_returns"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
