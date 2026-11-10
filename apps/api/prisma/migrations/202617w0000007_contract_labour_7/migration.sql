-- Contract labour CL-7 (CLB-05, founder answer 637): a contract worker becomes an employee through the PPL-12 joiner
-- flow. The joiner has the source "contract_worker" and points at the deployment it comes from; the same person row
-- is used (never a copy). On the joining day the deployment ends the day before and the contract_worker role closes;
-- earlier deployments, punches and register rows stay as contract-worker history. preboardings keeps its forced RLS.
ALTER TABLE "preboardings" ALTER COLUMN "source" TYPE VARCHAR(16);
ALTER TABLE "preboardings" DROP CONSTRAINT "preboardings_source_check";
ALTER TABLE "preboardings"
  ADD CONSTRAINT "preboardings_source_check" CHECK ("source" IN ('direct', 'import', 'offer', 'contract_worker')),
  ADD COLUMN "contract_deployment_id" UUID,
  ADD CONSTRAINT "preboardings_deployment_fkey" FOREIGN KEY ("contract_deployment_id") REFERENCES "contract_deployments"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "preboardings_deployment_check" CHECK (("source" = 'contract_worker') = ("contract_deployment_id" IS NOT NULL));
-- One open conversion per deployment.
CREATE UNIQUE INDEX "preboardings_open_deployment_key" ON "preboardings" ("organization_id", "contract_deployment_id") WHERE "contract_deployment_id" IS NOT NULL AND "status" = 'invited';
