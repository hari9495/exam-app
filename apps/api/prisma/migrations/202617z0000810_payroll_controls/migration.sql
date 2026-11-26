-- Enterprise E5 payroll controls (founder answers 2656, 2657; Oracle O16, O17).
-- O16: a one-time earning can be paid separately (its own bank file line and payslip section, same month) and grossed
-- up (the company pays its tax: the tax is added as a taxable "tax paid by the company" line and deducted in full, so
-- the person receives the whole amount). A grossed-up item always needs the payroll approver.
-- O17: each pay group has a payslip release day next to its cut-off day; one period's cut-off and release dates can be
-- changed with a reason (pay_group_period_dates). One-time pay sent after the cut-off rolls to next month's run
-- (rolled_from keeps the month it was asked for). Published payslips stay hidden from employees until the run's release
-- time; publishing before the release date with "release now" needs a reason.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "one_time_pays" ADD COLUMN "paid_separately" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "one_time_pays" ADD COLUMN "gross_up" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "one_time_pays" ADD COLUMN "rolled_from" DATE;
ALTER TABLE "payslip_lines" ADD COLUMN "separate" BOOLEAN NOT NULL DEFAULT false;

-- 0: payslips are released when they are published (as before); 1-31: that day of the month after the period.
ALTER TABLE "pay_groups" ADD COLUMN "release_day" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "pay_groups" ADD CONSTRAINT "pay_groups_release_day_check" CHECK ("release_day" BETWEEN 0 AND 31);

ALTER TABLE "payroll_runs" ADD COLUMN "release_at" TIMESTAMPTZ(3);
ALTER TABLE "payroll_runs" ADD COLUMN "release_reason" VARCHAR(500);
ALTER TABLE "payroll_runs" ADD COLUMN "release_noticed_at" TIMESTAMPTZ(3);

CREATE TABLE "pay_group_period_dates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "legal_entity_id" UUID NOT NULL,
  "pay_group_id" UUID NOT NULL REFERENCES "pay_groups"("id"),
  "period_start" DATE NOT NULL,
  "cut_off_on" DATE NOT NULL,
  "release_on" DATE,
  "reason" VARCHAR(500) NOT NULL,
  "changed_by" UUID NOT NULL,
  "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "pay_group_period_dates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pay_group_period_dates_order_check" CHECK ("release_on" IS NULL OR "release_on" >= "cut_off_on")
);
CREATE UNIQUE INDEX "pay_group_period_dates_key" ON "pay_group_period_dates" ("organization_id", "pay_group_id", "period_start");

REVOKE DELETE, TRUNCATE ON TABLE "pay_group_period_dates" FROM app_runtime;
ALTER TABLE "pay_group_period_dates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "pay_group_period_dates" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "pay_group_period_dates" AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL);

-- An employee sees a published run's payslips only once it is released (release_at null: released when published).
CREATE OR REPLACE FUNCTION payroll_runs_published(p_org UUID, p_ids UUID[]) RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prev TEXT := current_setting('app.pay_entities', true);
  out UUID[];
BEGIN
  IF p_org IS DISTINCT FROM app_current_org() THEN RETURN '{}'; END IF;
  PERFORM set_config('app.pay_entities', '{' || coalesce((SELECT string_agg(id::text, ',') FROM legal_entities WHERE organization_id = p_org), '') || '}', true);
  SELECT coalesce(array_agg(id), '{}') INTO out FROM payroll_runs WHERE organization_id = p_org AND id = ANY (p_ids) AND published_at IS NOT NULL AND (release_at IS NULL OR release_at <= now());
  PERFORM set_config('app.pay_entities', coalesce(prev, '{}'), true);
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION payroll_runs_published(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_runs_published(UUID, UUID[]) TO app_runtime;
