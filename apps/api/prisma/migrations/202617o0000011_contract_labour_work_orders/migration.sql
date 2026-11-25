-- Contract labour CL-2, answer 675: a contractor's work order (number, dates, headcount, the sites it covers). Deploying
-- past its headcount warns (never blocks: the licence maximum is the legal limit).
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "contractor_work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "headcount" INTEGER NOT NULL,
    "location_ids" UUID[] NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contractor_work_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contractor_work_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_work_orders_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contractor_work_orders_dates_check" CHECK ("to_on" >= "from_on"),
    CONSTRAINT "contractor_work_orders_headcount_check" CHECK ("headcount" BETWEEN 1 AND 100000),
    CONSTRAINT "contractor_work_orders_sites_check" CHECK (cardinality("location_ids") BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX "contractor_work_orders_number_key" ON "contractor_work_orders" ("organization_id", "agency_id", lower("number"));
ALTER TABLE "contractor_work_orders" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contractor_work_orders"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
