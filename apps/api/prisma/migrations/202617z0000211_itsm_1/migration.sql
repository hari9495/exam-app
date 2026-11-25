-- Helpdesk ITSM-1 (docs/yukthix/helpdesk-itsm-plan.md; answers 1931-1943): change and problem are ticket kinds on IT
-- desks only (1931); a change "fixes" a problem (new link kind); a standard-change template may be pre-approved (1935);
-- each IT desk keeps its change and problem settings, a missing row meaning the defaults (1933, 1934, 1937-1939).
-- Writes data (the new types on existing IT desks), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "sd_ticket_types" DROP CONSTRAINT "sd_ticket_types_kind_check",
  ADD CONSTRAINT "sd_ticket_types_kind_check" CHECK ("kind" IN ('incident', 'request', 'question', 'change', 'problem'));

ALTER TABLE "sd_ticket_links" DROP CONSTRAINT "sd_ticket_links_kind_check",
  ADD CONSTRAINT "sd_ticket_links_kind_check" CHECK ("kind" IN ('related', 'duplicate', 'blocks', 'caused_by', 'tracked_by', 'follow_up', 'fixes'));

-- Answer 1935: a standard change comes from a pre-approved template and skips approval; a failed one loses it.
ALTER TABLE "sd_templates" ADD COLUMN "pre_approved" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "sd_itsm_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "desk_id" UUID NOT NULL,
  -- Answer 1933: the risk questions (null: the five starter questions).
  "risk_questions" JSONB,
  -- Answer 1934: who approves each risk (lead | lead_owner | board).
  "route_low" VARCHAR(12) NOT NULL DEFAULT 'lead',
  "route_medium" VARCHAR(12) NOT NULL DEFAULT 'lead_owner',
  "route_high" VARCHAR(12) NOT NULL DEFAULT 'board',
  "board_user_ids" UUID[] NOT NULL DEFAULT '{}',
  "board_rule" VARCHAR(10) NOT NULL DEFAULT 'majority',
  "emergency_review_days" INTEGER NOT NULL DEFAULT 2,
  -- Answer 1937: the known-issue banner and its lead time.
  "banner_on" BOOLEAN NOT NULL DEFAULT true,
  "banner_hours" INTEGER NOT NULL DEFAULT 24,
  -- Answer 1938: the review after a high-risk, emergency or failed change, due within these working days.
  "review_days" INTEGER NOT NULL DEFAULT 5,
  -- Answer 1939: suggest a problem at this many incidents in these days.
  "repeat_count" INTEGER NOT NULL DEFAULT 3,
  "repeat_days" INTEGER NOT NULL DEFAULT 7,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_itsm_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_itsm_settings_desk_key" UNIQUE ("organization_id", "desk_id"),
  CONSTRAINT "sd_itsm_settings_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "sd_itsm_settings_route_check" CHECK ("route_low" IN ('lead', 'lead_owner', 'board') AND "route_medium" IN ('lead', 'lead_owner', 'board') AND "route_high" IN ('lead', 'lead_owner', 'board')),
  CONSTRAINT "sd_itsm_settings_board_rule_check" CHECK ("board_rule" IN ('majority', 'all')),
  CONSTRAINT "sd_itsm_settings_numbers_check" CHECK ("emergency_review_days" BETWEEN 1 AND 10 AND "banner_hours" BETWEEN 1 AND 168 AND "review_days" BETWEEN 1 AND 20 AND "repeat_count" BETWEEN 2 AND 20 AND "repeat_days" BETWEEN 1 AND 30)
);

ALTER TABLE "sd_itsm_settings" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sd_itsm_settings"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- Answer 1931: existing IT desks get the Change and Problem types (new IT desks get them from the starter set).
INSERT INTO "sd_ticket_types" ("organization_id", "desk_id", "kind", "name", "sort_order")
SELECT d.organization_id, d.id, k.kind,
  -- A desk that already has a type of that name gets "IT change" / "IT problem" (names are unique per desk).
  CASE WHEN EXISTS (SELECT 1 FROM "sd_ticket_types" n WHERE n.organization_id = d.organization_id AND n.desk_id = d.id AND n.name = k.name) THEN 'IT ' || lower(k.name) ELSE k.name END,
  k.sort_order
FROM "sd_desks" d
CROSS JOIN (VALUES ('change', 'Change', 90), ('problem', 'Problem', 91)) AS k(kind, name, sort_order)
WHERE d.kind = 'it'
  AND NOT EXISTS (SELECT 1 FROM "sd_ticket_types" t WHERE t.organization_id = d.organization_id AND t.desk_id = d.id AND t.kind = k.kind);
