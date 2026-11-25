-- HLP-13 collective disputes (4 Nov 2026; rules: docs/yukthix/helpdesk-design-map.md section 4h). A named industrial
-- relations team (a speak-up list only the System Admin keeps; an outside lawyer can be on it) keeps the company's record
-- of a collective dispute: the charter of demands, bipartite and conciliation meetings, the papers (each file with its
-- SHA-256 fingerprint) and the signed settlement. One IR member records the settlement, a second approves it, and only
-- then does it reach payroll as a wage-settlement arrears worksheet (PAY-37) that payroll checks and pays as usual.
-- Everything is append-only; the dispute's state is read from its steps. Legal clocks come from IN.IR.DISPUTE (verify).

ALTER TABLE "speakup_team_members" DROP CONSTRAINT "speakup_team_members_team_check";
ALTER TABLE "speakup_team_members" ADD CONSTRAINT "speakup_team_members_team_check" CHECK ("team" IN ('grievance', 'ethics', 'ic', 'escalation', 'safety', 'ir'));

CREATE TABLE "ir_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "union_name" VARCHAR(200) NOT NULL,
    "location_id" UUID NOT NULL,
    "workers_covered" INTEGER NOT NULL,
    "received_on" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ir_disputes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ir_disputes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ir_disputes_location_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE,
    CONSTRAINT "ir_disputes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "ir_disputes_number_check" CHECK ("number" > 0),
    CONSTRAINT "ir_disputes_workers_check" CHECK ("workers_covered" BETWEEN 1 AND 1000000)
);
CREATE UNIQUE INDEX "ir_disputes_number_key" ON "ir_disputes" ("organization_id", "number");

CREATE TABLE "ir_dispute_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "dispute_id" UUID NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ir_dispute_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ir_dispute_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ir_dispute_steps_dispute_fkey" FOREIGN KEY ("dispute_id") REFERENCES "ir_disputes"("id") ON DELETE CASCADE,
    CONSTRAINT "ir_dispute_steps_actor_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "ir_dispute_steps_kind_check" CHECK ("kind" IN ('demand', 'demand_update', 'meeting', 'paper', 'settlement_proposed', 'settlement_sent_back', 'settlement_approved', 'filed', 'closed'))
);
CREATE INDEX "ir_dispute_steps_dispute_idx" ON "ir_dispute_steps" ("dispute_id", "at");
-- One approved settlement per dispute: payroll gets exactly one arrears worksheet.
CREATE UNIQUE INDEX "ir_dispute_steps_one_approval_key" ON "ir_dispute_steps" ("dispute_id") WHERE "kind" = 'settlement_approved';

-- Four eyes in the database too (founder decision 3): an approval names a settlement proposal of the same dispute, and
-- its actor is never the person who proposed it.
CREATE FUNCTION "ir_dispute_four_eyes"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proposer UUID;
BEGIN
  IF NEW."kind" = 'settlement_approved' THEN
    SELECT s."actor_user_id" INTO proposer FROM "ir_dispute_steps" s
      WHERE s."id" = (NEW."data"->>'proposalId')::uuid AND s."dispute_id" = NEW."dispute_id" AND s."kind" = 'settlement_proposed';
    IF proposer IS NULL THEN
      RAISE EXCEPTION 'ir_dispute_four_eyes: no such settlement proposal' USING ERRCODE = 'check_violation';
    END IF;
    IF proposer = NEW."actor_user_id" THEN
      RAISE EXCEPTION 'ir_dispute_four_eyes: the person who recorded the settlement cannot approve it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ir_dispute_steps_four_eyes" BEFORE INSERT ON "ir_dispute_steps" FOR EACH ROW EXECUTE FUNCTION "ir_dispute_four_eyes"();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "ir_disputes", "ir_dispute_steps" FROM app_runtime;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ir_disputes', 'ir_dispute_steps']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    -- P02 Q8: YukthiX support never reads dispute records.
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- Data: the legal clocks (founder decision 2: rule sets marked verify, never in code). FORCE row-level security would
-- otherwise skip rows.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.IR.DISPUTE', 'IN', '2020-v1', '2025-11-21',
   '{"conciliationReportDays":60,"settlementCopyDays":10}',
   'Industrial Relations Code 2020 (in force 21 Nov 2025; it replaced the Industrial Disputes Act 1947, whose s.12(6) gave 14 days): s.53 the conciliation officer reports within 60 days of starting conciliation; a signed settlement''s copy goes to the conciliation officer and the Government within 10 days (rules). Verify with counsel.', true)
ON CONFLICT DO NOTHING;
