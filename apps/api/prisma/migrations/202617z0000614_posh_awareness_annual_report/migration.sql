-- Batch G1 answer 2593: the Internal Committee's awareness log and annual report (CMP-09 tabs). Each belongs to one committee
-- (null is the company committee, else a workplace's, answer 2592) and is seen only by that committee's members.
CREATE TABLE "posh_awareness_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "committee_location_id" UUID,
    "held_on" DATE NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "audience" VARCHAR(200),
    "attended" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "posh_awareness_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "posh_awareness_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "posh_awareness_sessions_attended_check" CHECK ("attended" BETWEEN 0 AND 100000),
    CONSTRAINT "posh_awareness_sessions_title_check" CHECK (char_length(btrim("title")) >= 3)
);
CREATE INDEX "posh_awareness_sessions_org_idx" ON "posh_awareness_sessions"("organization_id", "held_on");

-- The yearly report (calendar year, as the POSH Act asks): the figures are counted from the complaints and the log when it
-- is read; the row keeps the action taken and who moved it through draft, reviewed, sent to the employer and the District Officer.
CREATE TABLE "posh_annual_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "committee_location_id" UUID,
    "year" INTEGER NOT NULL,
    "stage" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "action_taken" VARCHAR(1000),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "employer_by" UUID,
    "employer_at" TIMESTAMPTZ(3),
    "district_by" UUID,
    "district_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "posh_annual_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "posh_annual_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "posh_annual_reports_stage_check" CHECK ("stage" IN ('draft', 'reviewed', 'employer', 'district')),
    CONSTRAINT "posh_annual_reports_year_check" CHECK ("year" BETWEEN 2013 AND 2100)
);
CREATE UNIQUE INDEX "posh_annual_reports_key" ON "posh_annual_reports" ("organization_id", "year", COALESCE("committee_location_id", '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "posh_awareness_sessions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "posh_awareness_sessions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- Only the members of that committee (the company's, or the workplace's), enforced by the database too.
CREATE POLICY ic_member_only ON "posh_awareness_sessions" AS RESTRICTIVE
  USING ((SELECT app_is_super_admin()) OR EXISTS (SELECT 1 FROM "speakup_team_members" m WHERE m.organization_id = "posh_awareness_sessions".organization_id AND m.team = 'ic' AND m.removed_at IS NULL AND m.user_id = (SELECT app_current_user_id()) AND m.location_id IS NOT DISTINCT FROM "posh_awareness_sessions".committee_location_id))
  WITH CHECK ((SELECT app_is_super_admin()) OR EXISTS (SELECT 1 FROM "speakup_team_members" m WHERE m.organization_id = "posh_awareness_sessions".organization_id AND m.team = 'ic' AND m.removed_at IS NULL AND m.user_id = (SELECT app_current_user_id()) AND m.location_id IS NOT DISTINCT FROM "posh_awareness_sessions".committee_location_id));
CREATE POLICY support_session_excluded ON "posh_awareness_sessions" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "posh_awareness_sessions" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);

ALTER TABLE "posh_annual_reports" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "posh_annual_reports"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- Only the members of that committee (the company's, or the workplace's), enforced by the database too.
CREATE POLICY ic_member_only ON "posh_annual_reports" AS RESTRICTIVE
  USING ((SELECT app_is_super_admin()) OR EXISTS (SELECT 1 FROM "speakup_team_members" m WHERE m.organization_id = "posh_annual_reports".organization_id AND m.team = 'ic' AND m.removed_at IS NULL AND m.user_id = (SELECT app_current_user_id()) AND m.location_id IS NOT DISTINCT FROM "posh_annual_reports".committee_location_id))
  WITH CHECK ((SELECT app_is_super_admin()) OR EXISTS (SELECT 1 FROM "speakup_team_members" m WHERE m.organization_id = "posh_annual_reports".organization_id AND m.team = 'ic' AND m.removed_at IS NULL AND m.user_id = (SELECT app_current_user_id()) AND m.location_id IS NOT DISTINCT FROM "posh_annual_reports".committee_location_id));
CREATE POLICY support_session_excluded ON "posh_annual_reports" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "posh_annual_reports" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
