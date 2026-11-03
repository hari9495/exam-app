-- HLP-07/08/09 cases on the HLP-06 case record (3 Nov 2026; rules: docs/yukthix/helpdesk-design-map.md section 4f).
-- Every step of a case (notice, delay, reply, more time, outcome proposal and approval, the IC report and its votes and
-- signature, interim relief and its HR task, stepping aside, members added, files, routing to the chair) is one row of
-- an append-only log; the case state is read from it. Nothing here is changed or deleted by the app.

ALTER TABLE "speakup_cases"
  ADD COLUMN "respondent_user_id" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  -- HLP-06 decision 1: an anonymous reporter's address for "You have an update" alerts, encrypted with the org secrets key.
  ADD COLUMN "alert_contact_enc" TEXT,
  ADD CONSTRAINT "speakup_cases_respondent_fkey" FOREIGN KEY ("respondent_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  -- The reporter is never the respondent, and an anonymous report has no alert address unless it is anonymous.
  ADD CONSTRAINT "speakup_cases_respondent_check" CHECK ("respondent_user_id" IS NULL OR "reporter_user_id" IS NULL OR "respondent_user_id" <> "reporter_user_id"),
  ADD CONSTRAINT "speakup_cases_alert_check" CHECK ("alert_contact_enc" IS NULL OR "identity" = 'anonymous');

CREATE TABLE "speakup_case_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "actor_user_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakup_case_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "speakup_case_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "speakup_case_steps_case_fkey" FOREIGN KEY ("case_id") REFERENCES "speakup_cases"("id") ON DELETE CASCADE,
    CONSTRAINT "speakup_case_steps_kind_check" CHECK ("kind" IN (
      'acknowledged', 'notice_sent', 'notice_delayed', 'more_time_asked', 'more_time_decided', 'replied',
      'proposed', 'approved', 'sent_back', 'ic_draft', 'ic_vote', 'ic_signed',
      'relief', 'relief_done', 'recused', 'member_added', 'routed_to_chair', 'file_added')),
    -- Every step but the respondent's own (reply, more time) has a case-team actor.
    CONSTRAINT "speakup_case_steps_actor_check" CHECK ("actor_user_id" IS NOT NULL)
);
CREATE INDEX "speakup_case_steps_case_idx" ON "speakup_case_steps" ("case_id", "at");
-- Four eyes in the database too: an approval's actor is never the proposer it names.
ALTER TABLE "speakup_case_steps" ADD CONSTRAINT "speakup_case_steps_four_eyes_check"
  CHECK ("kind" <> 'approved' OR ("data" ? 'proposedBy' AND "data"->>'proposedBy' <> "actor_user_id"::text));

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "speakup_case_steps" FROM app_runtime;

ALTER TABLE "speakup_case_steps" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "speakup_case_steps"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
-- P02 Q8: YukthiX support never reads cases.
CREATE POLICY support_session_excluded ON "speakup_case_steps" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);

-- Data: the POSH inquiry steps (notice to the respondent and the time to reply) as their own rule set, so the clocks
-- never live in code. FORCE row-level security would otherwise skip rows.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.POSH.INQUIRY', 'IN', '2013-v1', '2013-12-09',
   '{"noticeDays":7,"replyDays":10,"appealDays":90}',
   'Sexual Harassment of Women at Workplace Rules, 2013: rule 7(2) a copy of the complaint to the respondent within seven working days; rule 7(3) the reply within ten working days; Act s.18 and rule 11 appeal within ninety days of the recommendation. Counted here as calendar days. Verify with counsel.', true)
ON CONFLICT DO NOTHING;
