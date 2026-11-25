-- Help and onboarding H-5, founder answer 944 (12 Nov 2026): first-run tours. Each person's progress per tour and tour
-- version (company data, forced RLS): in progress at a step, finished or skipped. tour_id 'all' with status 'stopped'
-- means the person turned tours off for themselves. No data is written here.
CREATE TABLE "tour_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tour_id" VARCHAR(16) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "step" SMALLINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tour_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tour_progress_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "tour_progress_tour_check" CHECK ("tour_id" IN ('employee', 'manager', 'payroll', 'admin', 'all')),
    CONSTRAINT "tour_progress_status_check" CHECK ("status" IN ('in_progress', 'completed', 'skipped', 'stopped')),
    CONSTRAINT "tour_progress_step_check" CHECK ("step" BETWEEN 0 AND 2)
);
CREATE UNIQUE INDEX "tour_progress_user_tour_key" ON "tour_progress" ("organization_id", "user_id", "tour_id", "version");
ALTER TABLE "tour_progress" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tour_progress" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
