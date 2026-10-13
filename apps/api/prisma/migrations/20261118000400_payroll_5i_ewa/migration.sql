-- Payroll batch 5i, PAY-9.05 (M03 YX-PAY-40 / 41, B10): earned wage access. A dated policy per legal entity (off until
-- switched on), draws against pay already earned this month (the inputs kept with each draw), paid by the employer and
-- recovered in full as a named deduction in the month's regular payroll.
--   RLS as the rest of payroll; a person reads and asks for their own draws.

CREATE TABLE "ewa_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "valid_from" DATE NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "percent_available" DECIMAL(5,2) NOT NULL,
    "min_amount" DECIMAL(12,2) NOT NULL,
    "max_amount" DECIMAL(12,2) NOT NULL,
    "draws_per_month" INTEGER NOT NULL,
    "blackout_days" INTEGER NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fee_payer" VARCHAR(8) NOT NULL,
    "funding" VARCHAR(8) NOT NULL DEFAULT 'employer',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ewa_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ewa_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ewa_policies_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "ewa_policies_check" CHECK ("percent_available" > 0 AND "percent_available" <= 100 AND "min_amount" > 0 AND "max_amount" >= "min_amount" AND "draws_per_month" BETWEEN 1 AND 10 AND "blackout_days" BETWEEN 0 AND 15 AND "fee" >= 0 AND "fee_payer" IN ('employee', 'employer') AND "funding" IN ('employer', 'partner'))
);
CREATE UNIQUE INDEX "ewa_policies_key" ON "ewa_policies" ("organization_id", "legal_entity_id", "valid_from");

CREATE TABLE "ewa_draws" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "earned" JSONB NOT NULL,
    "available" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "fee_payer" VARCHAR(8) NOT NULL,
    "disclosure_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'requested',
    "paid_ref" VARCHAR(60),
    "paid_by" UUID,
    "paid_at" TIMESTAMPTZ(3),
    "failure_reason" VARCHAR(300),
    "recovery_ref" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ewa_draws_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ewa_draws_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ewa_draws_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "ewa_draws_policy_fkey" FOREIGN KEY ("policy_id") REFERENCES "ewa_policies"("id"),
    CONSTRAINT "ewa_draws_check" CHECK ("amount" > 0 AND "amount" <= "available" AND "fee" >= 0 AND "status" IN ('requested', 'paid', 'failed', 'cancelled') AND extract(day FROM "month") = 1)
);
CREATE INDEX "ewa_draws_month_idx" ON "ewa_draws" ("organization_id", "employment_id", "month");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ewa_policies', 'ewa_draws']
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
  EXECUTE
    'CREATE POLICY pay_guard ON "ewa_policies" AS RESTRICTIVE
       USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))';
  -- A person reads their own draws and asks for one (status requested only); payroll staff of the entity do the rest.
  EXECUTE
    'CREATE POLICY pay_guard ON "ewa_draws" AS RESTRICTIVE
       USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
       WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR ("status" = ''requested'' AND "employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[])))';
END $$;
