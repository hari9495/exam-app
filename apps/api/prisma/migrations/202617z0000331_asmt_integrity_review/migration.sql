-- Assessments AS-5 part 1 (answers 2006, 2008, 2012): integrity review. An attempt the integrity analysis flags gets an
-- incident; a reviewer gives a verdict with a reason; "attempt invalidated" needs a second, different reviewer. A
-- candidate may appeal a verdict that is not "cleared" within the company's window; someone other than the reviewer
-- decides it. Open incidents, open appeals and a verdict still open to appeal are the legal hold.

CREATE TABLE "integrity_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    -- open: waiting for a verdict; second_review: "attempt invalidated" waits for a second reviewer; decided.
    "status" VARCHAR(14) NOT NULL DEFAULT 'open',
    -- What raised it: the analysis level (review, high_concern) or a person (manual).
    "level" VARCHAR(14) NOT NULL,
    -- Who is reviewing it now (the queue's owner); anyone with the key may take it.
    "reviewer_id" UUID,
    "verdict" VARCHAR(10),
    "section_title" VARCHAR(200),
    "reason" VARCHAR(2000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    -- Set when a verdict other than "cleared" is final: the candidate may appeal until then.
    "appeal_closes_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integrity_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integrity_incidents_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "integrity_incidents_status_check" CHECK ("status" IN ('open', 'second_review', 'decided')),
    CONSTRAINT "integrity_incidents_level_check" CHECK ("level" IN ('review', 'high_concern', 'manual')),
    CONSTRAINT "integrity_incidents_verdict_check" CHECK ("verdict" IS NULL OR "verdict" IN ('cleared', 'warning', 'section', 'attempt')),
    -- Open: no verdict yet. Otherwise a verdict with a reason of 10+ characters, who gave it and when.
    CONSTRAINT "integrity_incidents_verdict_given_check" CHECK (
      ("status" = 'open') = ("verdict" IS NULL)
      AND ("verdict" IS NULL) = ("decided_by" IS NULL) AND ("decided_by" IS NULL) = ("decided_at" IS NULL)
      AND ("verdict" IS NULL OR char_length(btrim(coalesce("reason", ''))) >= 10)
      AND ("verdict" IS DISTINCT FROM 'section' OR char_length(btrim(coalesce("section_title", ''))) > 0)),
    -- YX-EVAL-01: invalidating an attempt needs a second reviewer, never the first.
    CONSTRAINT "integrity_incidents_second_check" CHECK (
      ("status" = 'second_review') <= ("verdict" = 'attempt' AND "confirmed_by" IS NULL)
      AND ("status" = 'decided' AND "verdict" = 'attempt') <= ("confirmed_by" IS NOT NULL AND "confirmed_by" <> "decided_by")
      AND ("confirmed_by" IS NULL) = ("confirmed_at" IS NULL)),
    CONSTRAINT "integrity_incidents_appeal_window_check" CHECK ("appeal_closes_at" IS NULL OR ("status" = 'decided' AND "verdict" <> 'cleared'))
);
CREATE UNIQUE INDEX "integrity_incidents_attempt_id_key" ON "integrity_incidents" ("attempt_id");
CREATE INDEX "integrity_incidents_organization_id_status_idx" ON "integrity_incidents" ("organization_id", "status");
CREATE TRIGGER asmt_org BEFORE INSERT ON "integrity_incidents" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();

-- PRC-27 / PRC-18: the candidate's appeal of a verdict, one per incident, decided by someone who did not give it.
CREATE TABLE "integrity_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "reason" VARCHAR(2000),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integrity_appeals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "integrity_appeals_incident_fkey" FOREIGN KEY ("incident_id") REFERENCES "integrity_incidents"("id") ON DELETE CASCADE,
    CONSTRAINT "integrity_appeals_attempt_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
    CONSTRAINT "integrity_appeals_text_check" CHECK (char_length(btrim("text")) >= 10),
    CONSTRAINT "integrity_appeals_status_check" CHECK ("status" IN ('open', 'upheld', 'overturned')),
    CONSTRAINT "integrity_appeals_decision_check" CHECK (("status" = 'open') = ("decided_by" IS NULL) AND ("decided_by" IS NULL) = ("decided_at" IS NULL)
      AND ("status" = 'open' OR char_length(btrim(coalesce("reason", ''))) >= 10))
);
CREATE UNIQUE INDEX "integrity_appeals_incident_id_key" ON "integrity_appeals" ("incident_id");
CREATE INDEX "integrity_appeals_organization_id_status_idx" ON "integrity_appeals" ("organization_id", "status");
CREATE TRIGGER asmt_org BEFORE INSERT ON "integrity_appeals" FOR EACH ROW EXECUTE FUNCTION asmt_org_from_attempt();

-- The appeal belongs to the incident's attempt, and is decided by someone other than the reviewers.
CREATE FUNCTION integrity_appeal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inc RECORD;
BEGIN
  SELECT "attempt_id", "decided_by", "confirmed_by" INTO inc FROM "integrity_incidents" WHERE "id" = NEW."incident_id";
  IF inc."attempt_id" IS DISTINCT FROM NEW."attempt_id" THEN
    RAISE EXCEPTION 'appeal attempt does not match its incident' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."decided_by" IS NOT NULL AND (NEW."decided_by" = inc."decided_by" OR NEW."decided_by" = inc."confirmed_by") THEN
    RAISE EXCEPTION 'an appeal is decided by someone who did not give the verdict' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER integrity_appeal_guard BEFORE INSERT OR UPDATE ON "integrity_appeals" FOR EACH ROW EXECUTE FUNCTION integrity_appeal_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['integrity_incidents', 'integrity_appeals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
    -- Verdicts and appeals are records: the app never deletes them (they go with the attempt).
    EXECUTE format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
  END LOOP;
END $$;
