-- HLP-08 founder answer 34 (4 Nov 2026): disciplinary show-cause cases on the same case record and append-only steps.
-- HR with case.disciplinary.raise opens one about an employee; the case goes to HR (routed_to 'hr'), the employee gets the
-- show-cause notice in My cases with the reply days from the standing orders (rule set IN.SO.MODEL, or the legal
-- entity's setting); two people decide (dropped, warning, or an inquiry, which is only recorded). Nothing changes in
-- People or Pay by itself. Rules: docs/yukthix/helpdesk-design-map.md section 4f.

ALTER TABLE "speakup_cases" DROP CONSTRAINT "speakup_cases_kind_check";
ALTER TABLE "speakup_cases" ADD CONSTRAINT "speakup_cases_kind_check" CHECK ("kind" IN ('grievance', 'whistleblower', 'posh', 'disciplinary'));
ALTER TABLE "speakup_cases" DROP CONSTRAINT "speakup_cases_routed_check";
ALTER TABLE "speakup_cases" ADD CONSTRAINT "speakup_cases_routed_check" CHECK ("routed_to" IN ('grievance', 'ethics', 'ic', 'escalation', 'hr'));
ALTER TABLE "speakup_cases"
  -- The employee's legal entity when the case was opened (its standing orders set the reply days).
  ADD COLUMN "legal_entity_id" UUID,
  -- The standing orders clause the misconduct falls under, as HR wrote it.
  ADD COLUMN "rule_clause" VARCHAR(200),
  -- A disciplinary case is always about someone, is opened by HR (named), goes to HR, and only HR opens one.
  ADD CONSTRAINT "speakup_cases_disciplinary_check" CHECK (
    ("kind" = 'disciplinary') = ("routed_to" = 'hr')
    AND ("kind" <> 'disciplinary' OR ("respondent_user_id" IS NOT NULL AND "identity" = 'named')));

-- Data: the rule set for the show-cause reply, the new key. FORCE row-level security would otherwise skip rows.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.SO.MODEL', 'IN', '1946-v1', '1946-04-23',
   '{"showCauseReplyDays":7}',
   'Industrial Employment (Standing Orders) Act, 1946 and the model standing orders: a worker charged with misconduct is told the charge in writing and given a chance to explain. Seven days to reply is the common figure in model and certified standing orders; the establishment''s certified standing orders prevail. Verify with counsel.', true)
ON CONFLICT DO NOTHING;

-- New key case.disciplinary.raise: the System Admin role and the HR Admin template get it; company HR Admin roles that still
-- follow the template get it too (additive only, audited like the start-up template sync). Never a manager by default.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'case.disciplinary.raise', 'Open a disciplinary show-cause case about an employee (HR); the case is seen only by its HR members and the employee')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'case.disciplinary.raise'
ON CONFLICT DO NOTHING;

WITH following AS (
  SELECT p.id, p.organization_id, p.name,
         (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT DISTINCT k FROM jsonb_array_elements_text(p.permissions_json::jsonb || '["case.disciplinary.raise"]'::jsonb) AS k) s) AS keys
  FROM permission_profiles p
  WHERE p.template_key = 'hr_admin'
    AND p.template_set IS NOT NULL
    AND (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.permissions_json::jsonb) AS k)
      = (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_array_elements_text(p.template_set::jsonb) AS k)
    AND NOT (p.permissions_json::jsonb ? 'case.disciplinary.raise')
    AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = p.organization_id)
), changed AS (
  UPDATE permission_profiles p
  SET permissions_json = f.keys::text, template_set = f.keys::text, updated_at = now()
  FROM following f
  WHERE p.id = f.id
  RETURNING p.id, p.organization_id, p.name
)
INSERT INTO audit_logs (id, organization_id, action, entity_type, entity_id, metadata_json, created_at)
SELECT gen_random_uuid(), c.organization_id, 'access.role.template_synced', 'permission_profile', c.id::text,
       json_build_object('template', 'hr_admin', 'role', c.name, 'added', json_build_array('case.disciplinary.raise'), 'notAddedConfidential', json_build_array(), 'by', 'migration 20261670000000')::text,
       now()
FROM changed c;
