-- E2 parts 5 and 7. A company's approval policy keeps ordered rules (a condition on the request type's declared values and
-- its own steps) before the "otherwise" route, which stays in "steps". The two hiring types (requisition, offer) get
-- company-editable notice text per event (answer 2648; review item 11: title, requester, step and link only).
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "approval_policies" ADD COLUMN "rules" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "approval_notice_texts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "request_type" VARCHAR(60) NOT NULL,
  "event" VARCHAR(20) NOT NULL,
  "subject" VARCHAR(150) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "updated_by" UUID,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_notice_texts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_notice_texts_type_check" CHECK ("request_type" IN ('ats.requisition', 'ats.offer')),
  CONSTRAINT "approval_notice_texts_event_check" CHECK ("event" IN ('requested', 'reminder', 'escalated', 'approved', 'turned_down', 'sent_back'))
);
CREATE UNIQUE INDEX "approval_notice_texts_org_type_event_key" ON "approval_notice_texts" ("organization_id", "request_type", "event");

GRANT DELETE ON TABLE "approval_notice_texts" TO app_runtime;
ALTER TABLE "approval_notice_texts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "approval_notice_texts" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Answer 2648: the old approval-email rows (Settings 5.4) become the hiring types' notices. Their {{actorName}},
-- {{subjectLabel}} and {{link}} become the new merge fields; {{contextText}} (the request's words) is dropped, since a
-- notice never carries the request summary. Only enabled rows; requested, approved and rejected have an event here.
INSERT INTO "approval_notice_texts" ("organization_id", "request_type", "event", "subject", "body")
SELECT t."organization_id", ty.k,
  CASE t."event_type" WHEN 'approval.requested' THEN 'requested' WHEN 'approval.approved' THEN 'approved' ELSE 'turned_down' END,
  LEFT(regexp_replace(replace(replace(replace(t."subject", '{{actorName}}', '{requester}'), '{{subjectLabel}}', '{title}'), '{{link}}', '{link}'), '\{\{[^}]*\}\}', '', 'g'), 150),
  LEFT(regexp_replace(replace(replace(replace(t."body", '{{actorName}}', '{requester}'), '{{subjectLabel}}', '{title}'), '{{link}}', '{link}'), '\{\{[^}]*\}\}', '', 'g'), 2000)
FROM "approval_email_templates" t CROSS JOIN (VALUES ('ats.requisition'), ('ats.offer')) AS ty(k)
WHERE t."enabled" AND t."event_type" IN ('approval.requested', 'approval.approved', 'approval.rejected')
ON CONFLICT DO NOTHING;
