-- Assessments AS-4b (answer 2011): before the test. No rows are written here.

-- The company of a row that belongs to an invitation (as asmt_org_from_attempt does for attempts).
CREATE FUNCTION asmt_org_from_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" IS NULL THEN
    SELECT i."organization_id" INTO NEW."organization_id" FROM "invitations" i WHERE i."id" = NEW."invitation_id";
  END IF;
  RETURN NEW;
END $$;

-- PRC-23 / PRC-11: a candidate asks for help with the test (with optional evidence, special data); the test owner
-- decides each item. Approved extra time becomes the invitation's extra time. 'identity' is the manual identity check
-- a candidate asks for after saying no to face checks (PRC-24).
CREATE TABLE "accommodation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "kinds" VARCHAR(20)[] NOT NULL,
    "extra_time_percent" INTEGER,
    "note" VARCHAR(2000),
    "evidence_path" TEXT,
    "evidence_name" VARCHAR(255),
    "evidence_type" VARCHAR(40),
    "status" VARCHAR(12) NOT NULL DEFAULT 'pending',
    "approved_kinds" VARCHAR(20)[] NOT NULL DEFAULT '{}',
    "granted_extra_time_percent" INTEGER,
    "message" VARCHAR(2000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accommodation_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accommodation_requests_invitation_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE,
    CONSTRAINT "accommodation_requests_kinds_check" CHECK (cardinality("kinds") BETWEEN 1 AND 7
      AND "kinds" <@ ARRAY['time', 'breaks', 'reader', 'font', 'separate', 'profile', 'identity']::VARCHAR(20)[]),
    CONSTRAINT "accommodation_requests_time_check" CHECK (("extra_time_percent" IS NULL OR "extra_time_percent" IN (25, 50, 100))
      AND ("granted_extra_time_percent" IS NULL OR "granted_extra_time_percent" IN (25, 50, 100))),
    CONSTRAINT "accommodation_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'partly', 'declined')),
    -- A decision says who made it and when; approved items are items that were asked for.
    CONSTRAINT "accommodation_requests_decision_check" CHECK (("status" = 'pending') = ("decided_by" IS NULL) AND ("decided_by" IS NULL) = ("decided_at" IS NULL)
      AND "approved_kinds" <@ "kinds")
);
-- One open request per invitation.
CREATE UNIQUE INDEX "accommodation_requests_open_key" ON "accommodation_requests" ("invitation_id") WHERE "status" = 'pending';
CREATE INDEX "accommodation_requests_organization_id_status_idx" ON "accommodation_requests" ("organization_id", "status");
CREATE TRIGGER asmt_org BEFORE INSERT ON "accommodation_requests" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_invitation();

-- PRC-10: time lost to the connection beyond asmt.time_credit_cap (AS-4a credits up to the cap), waiting for a person.
-- One open row per attempt; later gaps above the cap add to it.
CREATE TABLE "connectivity_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "lost_ms" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(1000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "connectivity_credits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "connectivity_credits_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "connectivity_credits_lost_check" CHECK ("lost_ms" > 0),
    CONSTRAINT "connectivity_credits_status_check" CHECK ("status" IN ('pending', 'approved', 'declined')),
    -- A decision has a reason (at least 10 characters), a person and a time.
    CONSTRAINT "connectivity_credits_decision_check" CHECK (("status" = 'pending') = ("decided_by" IS NULL) AND ("decided_by" IS NULL) = ("decided_at" IS NULL)
      AND ("status" = 'pending' OR char_length(btrim("reason")) >= 10))
);
CREATE UNIQUE INDEX "connectivity_credits_open_key" ON "connectivity_credits" ("attempt_id") WHERE "status" = 'pending';
CREATE INDEX "connectivity_credits_organization_id_status_idx" ON "connectivity_credits" ("organization_id", "status");
CREATE TRIGGER asmt_org BEFORE INSERT ON "connectivity_credits" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accommodation_requests', 'connectivity_credits'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
    -- Decisions and evidence are records: the app never deletes them (they go with the invitation or attempt).
    EXECUTE format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
  END LOOP;
END $$;
