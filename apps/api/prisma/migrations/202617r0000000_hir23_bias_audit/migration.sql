-- HIR-23 bias audit record (founder decision 2, question 7), 13 Nov 2026. A company that uses an automated tool for New
-- York City jobs (setting hiring.bias_audit.nyc, default off) records each independent bias audit: the auditor, the
-- date, the published summary, the summary results and the report file. The law's places, categories and how long an
-- audit counts are data in the rule set HIR.BIAS_AUDIT, marked verify until counsel checks it (GO-LIVE-CHECKLIST).
CREATE TABLE "bias_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "audited_on" DATE NOT NULL,
    "auditor" VARCHAR(200) NOT NULL,
    "summary_url" VARCHAR(500) NOT NULL,
    -- {"sex":[{"label","assessed","selected"}],"race":[...]}: as reported by the auditor; no candidate identities.
    "results" JSONB NOT NULL,
    "report_path" VARCHAR(500) NOT NULL,
    "report_name" VARCHAR(200) NOT NULL,
    "note" VARCHAR(1000),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bias_audits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bias_audits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "bias_audits_org_date_idx" ON "bias_audits" ("organization_id", "audited_on" DESC);
ALTER TABLE "bias_audits" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "bias_audits"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- An audit is a record of what the auditor found: never edited (a correction is a new audit).
CREATE FUNCTION bias_audits_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'bias audits are append-only' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER bias_audits_append_only BEFORE UPDATE ON "bias_audits" FOR EACH ROW EXECUTE FUNCTION bias_audits_append_only();

SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('HIR.BIAS_AUDIT', 'US-NY', '2023-v1', '2023-07-05',
   '{"name":"NYC Local Law 144 (automated employment decision tools)","cities":["New York","New York City","NYC","Manhattan","Brooklyn","Queens","Bronx","The Bronx","Staten Island"],"validMonths":12,"categories":{"sex":["Female","Male","Unknown / not given"],"race":["Hispanic or Latino","White","Black or African American","Native Hawaiian or Pacific Islander","Asian","Native American or Alaska Native","Two or more races","Unknown / not given"]}}',
   'NYC Admin Code s.20-870 to 20-874 (Local Law 144 of 2021) and DCWP rules 6 RCNY s.5-300 (enforced from 5 Jul 2023): an independent bias audit within one year before using an AEDT for a job in New York City, its summary published, impact ratios by sex and race/ethnicity (EEO-1). Verify with counsel.', true)
ON CONFLICT DO NOTHING;
