-- HLP-06 speak-up filing (3 Nov 2026; rules: docs/yukthix/helpdesk-design-map.md section 4e). Grievances, ethics concerns
-- and POSH complaints; the company's case officers per list; the smallest case record HLP-07/08/09 build on. An anonymous
-- report has no user, employee, IP or device, and its reply code is kept only as an HMAC hash. Nothing a reporter files is
-- deleted by the app; messages and routing are append-only. YukthiX support sessions never read any of it.

-- The company's lists of case officers: grievance team, ethics team, Internal Committee, escalation (e.g. audit chair).
CREATE TABLE "speakup_team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "team" VARCHAR(12) NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(12) NOT NULL DEFAULT 'member',
    "added_by" UUID,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_by" UUID,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "speakup_team_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "speakup_team_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "speakup_team_members_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "speakup_team_members_team_check" CHECK ("team" IN ('grievance', 'ethics', 'ic', 'escalation')),
    CONSTRAINT "speakup_team_members_role_check" CHECK ("role" IN ('member', 'presiding', 'external'))
);
CREATE UNIQUE INDEX "speakup_team_members_live_key" ON "speakup_team_members" ("organization_id", "team", "user_id") WHERE "removed_at" IS NULL;

CREATE TABLE "speakup_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(14) NOT NULL,
    "number" INTEGER NOT NULL,
    "identity" VARCHAR(10) NOT NULL,
    "reporter_user_id" UUID,
    "reporter_employee_id" UUID,
    "reply_code_hash" CHAR(64),
    "category" VARCHAR(80),
    "summary" TEXT NOT NULL,
    "happened_on" DATE,
    "location_id" UUID,
    "involved" VARCHAR(300),
    "outside_name" VARCHAR(150),
    "outside_employer" VARCHAR(150),
    "witnesses" VARCHAR(300),
    "retaliation_worry" BOOLEAN NOT NULL DEFAULT false,
    "about_user_id" UUID,
    "routed_to" VARCHAR(12) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'received',
    "file_ids" UUID[] NOT NULL DEFAULT '{}',
    "late" BOOLEAN NOT NULL DEFAULT false,
    "ack_due_on" DATE NOT NULL,
    "decide_due_on" DATE,
    "rule_set" VARCHAR(60),
    "filed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakup_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "speakup_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "speakup_cases_kind_check" CHECK ("kind" IN ('grievance', 'whistleblower', 'posh')),
    CONSTRAINT "speakup_cases_routed_check" CHECK ("routed_to" IN ('grievance', 'ethics', 'ic', 'escalation')),
    CONSTRAINT "speakup_cases_status_check" CHECK ("status" IN ('received', 'acknowledged', 'investigation', 'closed')),
    -- Anonymous: nobody is recorded, only the code's hash. Named: the reporter, never a code.
    CONSTRAINT "speakup_cases_identity_check" CHECK (
      ("identity" = 'anonymous' AND "reporter_user_id" IS NULL AND "reporter_employee_id" IS NULL AND "reply_code_hash" IS NOT NULL)
      OR ("identity" = 'named' AND "reporter_user_id" IS NOT NULL AND "reply_code_hash" IS NULL)),
    -- The Internal Committee must hear the complainant: a POSH complaint is always named.
    CONSTRAINT "speakup_cases_posh_named_check" CHECK ("kind" <> 'posh' OR "identity" = 'named'),
    CONSTRAINT "speakup_cases_number_check" CHECK ("number" > 0)
);
CREATE UNIQUE INDEX "speakup_cases_number_key" ON "speakup_cases" ("organization_id", "kind", "number");
CREATE UNIQUE INDEX "speakup_cases_code_key" ON "speakup_cases" ("reply_code_hash") WHERE "reply_code_hash" IS NOT NULL;

-- Who the case was routed to when it was filed (HLP-08 adds and removes members with its own record).
CREATE TABLE "speakup_case_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakup_case_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "speakup_case_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "speakup_case_members_case_fkey" FOREIGN KEY ("case_id") REFERENCES "speakup_cases"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "speakup_case_members_key" ON "speakup_case_members" ("case_id", "user_id");

CREATE TABLE "speakup_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "sender" VARCHAR(10) NOT NULL,
    "author_user_id" UUID,
    "body" TEXT NOT NULL,
    "file_ids" UUID[] NOT NULL DEFAULT '{}',
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "speakup_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "speakup_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "speakup_messages_case_fkey" FOREIGN KEY ("case_id") REFERENCES "speakup_cases"("id") ON DELETE CASCADE,
    CONSTRAINT "speakup_messages_sender_check" CHECK ("sender" IN ('reporter', 'team')),
    CONSTRAINT "speakup_messages_author_check" CHECK ("sender" = 'reporter' OR "author_user_id" IS NOT NULL)
);
CREATE INDEX "speakup_messages_case_idx" ON "speakup_messages" ("case_id", "sent_at");

REVOKE DELETE, TRUNCATE ON TABLE "speakup_team_members", "speakup_cases" FROM app_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "speakup_case_members", "speakup_messages" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['speakup_team_members', 'speakup_cases', 'speakup_case_members', 'speakup_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads speak-up reports.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- Data: the statutory rule sets for the clocks, and the new key. FORCE row-level security would otherwise skip rows.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.POSH', 'IN', '2013-v1', '2013-12-09',
   '{"filingMonths":3,"filingExtensionMonths":3,"inquiryDays":90,"reportDays":10,"actionDays":60}',
   'Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013: s.9(1) complaint within three months of the incident (the last one in a series), extendable by up to three months for reasons recorded; s.11(4) inquiry within ninety days; s.13(1) report within ten days of the inquiry; s.13(4) the employer acts within sixty days of the report. Verify with counsel.', true),
  ('IN.GRC', 'IN', '2020-v1', '2025-11-21',
   '{"disposalDays":30}',
   'Industrial Relations Code, 2020, s.4: a Grievance Redressal Committee in an establishment of twenty or more workers completes its proceedings within thirty days of receiving a written application. Verify with counsel.', true)
ON CONFLICT DO NOTHING;

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'speakup.setup.manage', 'Choose the speak-up case officers: the grievance team, the ethics team, the Internal Committee and the escalation list')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'speakup.setup.manage'
ON CONFLICT DO NOTHING;
