-- Payroll batch 5i, core and PAY-9.02 (M03-BUILD-DESIGN §5.10, §17.9; M03 YX-PAY-59): special pay reaches payroll as a
-- posting (one sheet of lines for a month, made by one person and approved by another through P03); an approved posting
-- becomes approved one-time pay, which the run already pays. Piece-rate cards and output.
--   RLS: forced, tenant isolation, no YukthiX support sessions, and the pay guard (payroll staff by legal entity; a
--   worker reads their own output).

-- The 5i keys (M03-BUILD-DESIGN §6.2).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.special.manage', 'Special pay: piece-rate, incentives and commission, tips, on-call, union dues, settlements, lay-off and VRS, sent to payroll for approval'),
  (gen_random_uuid(), 'payroll.ewa.manage', 'Earned wage access: the policy, draws and their payment and recovery'),
  (gen_random_uuid(), 'payroll.equity.manage', 'Equity plans: valuations, grants, vesting, exercises and the cap table')
ON CONFLICT DO NOTHING;

-- One-time pay from the 5i sources.
ALTER TABLE "one_time_pays" DROP CONSTRAINT "one_time_pays_source_check";
ALTER TABLE "one_time_pays" ADD CONSTRAINT "one_time_pays_source_check" CHECK ("source" IN ('manual', 'm05', 'm06', 'm09', 'm10', 'm08', 'm01', 'loan', 'arrears', 'fnf', 'piece', 'incentive', 'tips', 'oncall', 'union', 'layoff', 'vrs', 'settle', 'ewa'));

CREATE TABLE "special_postings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "month" DATE NOT NULL,
    "source_ref" VARCHAR(80) NOT NULL,
    "lines" JSONB NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "made_by" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_postings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "special_postings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "special_postings_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "special_postings_kind_check" CHECK ("kind" IN ('piece', 'incentive', 'tips', 'oncall', 'union', 'layoff', 'vrs', 'settle')),
    CONSTRAINT "special_postings_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT "special_postings_month_check" CHECK (extract(day FROM "month") = 1)
);
-- One live posting per sheet (a piece-rate month, a pool, a plan's month …): never paid twice.
CREATE UNIQUE INDEX "special_postings_live_key" ON "special_postings" ("organization_id", "kind", "source_ref") WHERE "status" IN ('pending', 'approved');
CREATE INDEX "special_postings_month_idx" ON "special_postings" ("organization_id", "legal_entity_id", "month");

CREATE TABLE "piece_rate_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "operation_code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit" VARCHAR(20) NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_rate_cards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "piece_rate_cards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "piece_rate_cards_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "piece_rate_cards_check" CHECK ("rate" > 0 AND ("valid_to" IS NULL OR "valid_to" >= "valid_from"))
);
CREATE UNIQUE INDEX "piece_rate_cards_key" ON "piece_rate_cards" ("organization_id", "legal_entity_id", "operation_code", "valid_from");

CREATE TABLE "piece_outputs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "operation_code" VARCHAR(30) NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "source" VARCHAR(8) NOT NULL DEFAULT 'manual',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_outputs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "piece_outputs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "piece_outputs_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "piece_outputs_check" CHECK ("quantity" > 0 AND "source" IN ('manual', 'import'))
);
CREATE UNIQUE INDEX "piece_outputs_key" ON "piece_outputs" ("organization_id", "employment_id", "work_date", "operation_code");
CREATE INDEX "piece_outputs_month_idx" ON "piece_outputs" ("organization_id", "legal_entity_id", "work_date");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['special_postings', 'piece_rate_cards', 'piece_outputs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['special_postings', 'piece_rate_cards']
  LOOP
    EXECUTE format(
      'CREATE POLICY pay_guard ON %I AS RESTRICTIVE
         USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
         WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))',
      t);
  END LOOP;
  -- A worker reads their own output; payroll staff of the entity read and write it.
  EXECUTE
    'CREATE POLICY pay_guard ON "piece_outputs" AS RESTRICTIVE
       USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))';
END $$;
