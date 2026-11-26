-- IT costs into budgets (GLPI 7, answer 2719). On IT desks, a ticket's cost is its logged time at the hourly rate of the
-- team it is with (the rate is kept on each time entry, so a later rate change never rewrites the past) plus fixed or
-- material cost lines (a change is a ticket, so changes carry them too). Each cost is charged to the requester's
-- department on the day (kept on the entry or line). Each department has a yearly IT budget (the financial year, as
-- the training budgets), shown with spent and left to holders of desk.budget.manage.
SELECT set_config('app.is_super_admin', 'on', true);

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'desk.budget.manage', 'IT budgets: set each department''s yearly IT budget and see IT costs against it')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', p."id" FROM "permissions" p WHERE p."key" = 'desk.budget.manage'
ON CONFLICT DO NOTHING;

ALTER TABLE "sd_groups" ADD COLUMN "hourly_rate" DECIMAL(10,2);
ALTER TABLE "sd_groups" ADD CONSTRAINT "sd_groups_hourly_rate_check" CHECK ("hourly_rate" IS NULL OR "hourly_rate" > 0);
ALTER TABLE "sd_time_entries" ADD COLUMN "hourly_rate" DECIMAL(10,2);
ALTER TABLE "sd_time_entries" ADD COLUMN "department_id" UUID;

CREATE TABLE "sd_cost_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "desk_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "kind" VARCHAR(10) NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "cost_on" DATE NOT NULL,
  "department_id" UUID,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removed_at" TIMESTAMPTZ(3),
  "removed_by" UUID,
  "remove_reason" VARCHAR(300),
  CONSTRAINT "sd_cost_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_cost_lines_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
  CONSTRAINT "sd_cost_lines_kind_check" CHECK ("kind" IN ('fixed', 'material')),
  CONSTRAINT "sd_cost_lines_amount_check" CHECK ("amount" > 0)
);
CREATE INDEX "sd_cost_lines_ticket_idx" ON "sd_cost_lines" ("organization_id", "ticket_id");
CREATE INDEX "sd_cost_lines_on_idx" ON "sd_cost_lines" ("organization_id", "cost_on");

CREATE TABLE "sd_it_budgets" (
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "department_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "updated_by" UUID NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sd_it_budgets_pkey" PRIMARY KEY ("department_id", "year"),
  CONSTRAINT "sd_it_budgets_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "sd_it_budgets_org_idx" ON "sd_it_budgets" ("organization_id", "year");

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_cost_lines', 'sd_it_budgets'] LOOP
    EXECUTE format('REVOKE DELETE, TRUNCATE ON TABLE %I FROM app_runtime', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))', t);
    EXECUTE format('CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE USING ((SELECT app_support_session()) IS NULL) WITH CHECK ((SELECT app_support_session()) IS NULL)', t);
  END LOOP;
END $$;
