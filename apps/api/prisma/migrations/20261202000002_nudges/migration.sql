-- Nudge (PLT-02 Team today, 19 Oct 2026): a manager or HR reminds someone about an item still waiting, today "check in".
-- One nudge per item per person per day, whoever sends it (the unique key is the rate limit). Kept as a record: the app
-- adds rows and never changes or removes them.
CREATE TABLE "nudges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "item" VARCHAR(20) NOT NULL,
    "on_day" DATE NOT NULL,
    "sent_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nudges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nudges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nudges_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "nudges_item_check" CHECK ("item" IN ('check_in'))
);
CREATE UNIQUE INDEX "nudges_once_a_day_key" ON "nudges"("organization_id", "employee_id", "item", "on_day");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "nudges" FROM app_runtime;

ALTER TABLE "nudges" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "nudges"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
