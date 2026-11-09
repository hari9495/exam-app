-- HIR-28 bulk offers: one batch of offers for one job (one letter, one salary structure, one joining day, a fixed CTC per
-- candidate). Each offer in it is an ordinary HIR-09 offer (its own band check, route, conditions, e-sign and send); the
-- batch keeps who asked, the common choices and each row's result, and an idempotency key so a retry never sends twice.
-- Schema only: no data is written.
CREATE TABLE "offer_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "batch_key" UUID NOT NULL,
    "choices" JSONB NOT NULL,
    "results" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(12) NOT NULL DEFAULT 'running',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    CONSTRAINT "offer_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offer_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "offer_batches_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "offer_batches_status_check" CHECK ("status" IN ('running', 'done'))
);
CREATE UNIQUE INDEX "offer_batches_org_key_key" ON "offer_batches" ("organization_id", "batch_key");
CREATE INDEX "offer_batches_org_job_idx" ON "offer_batches" ("organization_id", "job_id");
ALTER TABLE "offer_batches" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "offer_batches"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

ALTER TABLE "offers" ADD COLUMN "batch_id" UUID;
CREATE INDEX "offers_org_batch_idx" ON "offers" ("organization_id", "batch_id");
