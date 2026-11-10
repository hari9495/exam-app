-- Visitors slice 2 (answers 601, 602, 604, 606, 610; 10 Nov 2026): walk-ins on the kiosk in visitor mode and at the
-- reception desk; the host approves a walk-in within the location's minutes, then reception decides (audited); the
-- visitor's photo (shown to the host only on the approval card, deleted with the visit); visitor types with their NDA
-- and safety induction (texts from the Policies module, acknowledged per visit; an NDA counts for 1 year for the same
-- person and company); allowed hours guard the kiosk, reception lets a visitor in outside them with a reason.

ALTER TABLE "visits"
  ADD COLUMN "walk_in" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "visitor_type_id" UUID,
  ADD COLUMN "kiosk_device_id" UUID,
  ADD COLUMN "photo_path" VARCHAR(500),
  ADD COLUMN "approval_due_at" TIMESTAMPTZ(3),
  ADD COLUMN "decided_by" UUID,
  ADD COLUMN "decided_at" TIMESTAMPTZ(3),
  -- host or reception (604: reception decides after the host's minutes)
  ADD COLUMN "decided_via" VARCHAR(10),
  ADD COLUMN "decision_reason" VARCHAR(300),
  -- 610: reception let the visitor in outside the allowed hours, and why
  ADD COLUMN "hours_override_reason" VARCHAR(300);

-- Two new states: a walk-in waiting for the host, and a walk-in the host or reception declined.
-- NOTE for the merge with slice 3: if slice 3 also changes this constraint, the merged list must keep both sets.
ALTER TABLE "visits" DROP CONSTRAINT "visits_status_check";
ALTER TABLE "visits" ADD CONSTRAINT "visits_status_check" CHECK ("status" IN ('expected', 'waiting', 'on_site', 'checked_out', 'not_out', 'no_show', 'cancelled', 'declined'));
ALTER TABLE "visits" DROP CONSTRAINT "visits_via_check";
ALTER TABLE "visits" ADD CONSTRAINT "visits_via_check" CHECK ("notice_accepted_via" IS NULL OR "notice_accepted_via" IN ('link', 'desk', 'kiosk'));
ALTER TABLE "visits" ADD CONSTRAINT "visits_decided_via_check" CHECK ("decided_via" IS NULL OR "decided_via" IN ('host', 'reception'));
CREATE INDEX "visits_waiting_idx" ON "visits" ("organization_id", "host_user_id") WHERE "status" = 'waiting';

-- 606: the company's visitor types (Settings 3.12): escort, and the policy documents for the NDA and the induction.
CREATE TABLE "visitor_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "escort" BOOLEAN NOT NULL DEFAULT false,
    "nda_policy_id" UUID,
    "induction_policy_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visitor_types_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visitor_types_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "visitor_types_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX "visitor_types_name_key" ON "visitor_types" ("organization_id", lower("name"));
ALTER TABLE "visits" ADD CONSTRAINT "visits_type_fkey" FOREIGN KEY ("visitor_type_id") REFERENCES "visitor_types"("id") ON DELETE SET NULL;

-- 606: what a visitor acknowledged (the policy version and its text hash). An NDA counts for 1 year for the same person
-- and company (person_key: a keyed hash of mobile and company, never the number itself); the induction every visit.
CREATE TABLE "visit_acknowledgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "visit_id" UUID,
    "kind" VARCHAR(10) NOT NULL,
    "policy_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "body_sha256" CHAR(64) NOT NULL,
    "person_key" CHAR(64) NOT NULL,
    "via" VARCHAR(6) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visit_acknowledgements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "visit_acknowledgements_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "visit_acknowledgements_visit_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE SET NULL,
    CONSTRAINT "visit_acknowledgements_kind_check" CHECK ("kind" IN ('nda', 'induction')),
    CONSTRAINT "visit_acknowledgements_via_check" CHECK ("via" IN ('link', 'kiosk', 'desk'))
);
CREATE INDEX "visit_acknowledgements_person_idx" ON "visit_acknowledgements" ("organization_id", "person_key", "kind", "acknowledged_at" DESC);
CREATE INDEX "visit_acknowledgements_visit_idx" ON "visit_acknowledgements" ("visit_id");
-- An acknowledgement is a record: never edited.
CREATE FUNCTION visit_acknowledgements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind <> OLD.kind OR NEW.policy_id <> OLD.policy_id OR NEW.version_id <> OLD.version_id OR NEW.body_sha256 <> OLD.body_sha256 OR NEW.person_key <> OLD.person_key OR NEW.acknowledged_at <> OLD.acknowledged_at THEN
    RAISE EXCEPTION 'visitor acknowledgements are append-only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visit_acknowledgements_append_only BEFORE UPDATE ON "visit_acknowledgements" FOR EACH ROW EXECUTE FUNCTION visit_acknowledgements_append_only();

ALTER TABLE "visitor_types" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "visit_acknowledgements" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "visitor_types" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY tenant_isolation ON "visit_acknowledgements" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
