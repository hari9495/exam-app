-- Contract labour CL-2 (answers 624, 632, 633, 635, 636; CLB-02, PPL-01, PPL-35): a contract worker is a person with the
-- contract_worker role (person_roles, source contract_deployments) and a deployment by a contractor at one of our sites.
-- Never an employee, never on our payroll, no login. The deployment keeps the date of birth (the under-18 block), only
-- the last 4 digits of the Aadhaar and a keyed hash to find the same person again (never the full number), the skill,
-- the wage the contractor pays, UAN and ESI IP, the site safety induction and the gate pass (a number and an end date).
-- A deployment waits for site approval; approval issues the gate pass after the induction.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "contract_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "agency_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "skill" VARCHAR(14) NOT NULL,
    -- Monthly wage the contractor pays (the principal employer's check, CL-4); not ours to pay.
    "wage_paise" BIGINT,
    "dob" DATE NOT NULL,
    "id_last4" CHAR(4) NOT NULL,
    -- HMAC of the Aadhaar number (company key): the same person across contractors, never readable back.
    "id_hash" CHAR(64) NOT NULL,
    "uan" VARCHAR(12),
    "esic_ip" VARCHAR(10),
    "from_on" DATE NOT NULL,
    "to_on" DATE,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "induction_on" DATE,
    "induction_by" VARCHAR(120),
    "gate_pass_no" VARCHAR(30),
    "gate_valid_to" DATE,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "released_on" DATE,
    "release_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_deployments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_deployments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "contract_deployments_skill_check" CHECK ("skill" IN ('unskilled', 'semi_skilled', 'skilled', 'highly_skilled')),
    CONSTRAINT "contract_deployments_status_check" CHECK ("status" IN ('pending', 'deployed', 'released')),
    CONSTRAINT "contract_deployments_wage_check" CHECK ("wage_paise" IS NULL OR "wage_paise" > 0),
    CONSTRAINT "contract_deployments_last4_check" CHECK ("id_last4" ~ '^[0-9]{4}$'),
    CONSTRAINT "contract_deployments_uan_check" CHECK ("uan" IS NULL OR "uan" ~ '^[0-9]{12}$'),
    CONSTRAINT "contract_deployments_ip_check" CHECK ("esic_ip" IS NULL OR "esic_ip" ~ '^[0-9]{10}$'),
    CONSTRAINT "contract_deployments_dates_check" CHECK ("to_on" IS NULL OR "to_on" >= "from_on"),
    CONSTRAINT "contract_deployments_pass_check" CHECK (("status" <> 'pending' OR "gate_pass_no" IS NULL) AND ("status" <> 'deployed' OR ("gate_pass_no" IS NOT NULL AND "gate_valid_to" IS NOT NULL))),
    CONSTRAINT "contract_deployments_released_check" CHECK (("status" = 'released') = ("released_on" IS NOT NULL))
);
-- Never deployed twice at once (by two contractors or two sites): the same ID while pending or deployed.
CREATE UNIQUE INDEX "contract_deployments_active_key" ON "contract_deployments" ("organization_id", "id_hash") WHERE "status" IN ('pending', 'deployed');
CREATE UNIQUE INDEX "contract_deployments_gate_pass_key" ON "contract_deployments" ("organization_id", "gate_pass_no") WHERE "gate_pass_no" IS NOT NULL;
CREATE INDEX "contract_deployments_site_idx" ON "contract_deployments" ("organization_id", "location_id", "agency_id", "status");
CREATE INDEX "contract_deployments_person_idx" ON "contract_deployments" ("organization_id", "person_id");
ALTER TABLE "contract_deployments" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contract_deployments"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
