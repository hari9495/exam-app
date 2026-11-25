-- HIR-09 offer builder and HIR-29 offer conditions (founder decisions 4 and 5, 9 Nov 2026,
-- docs/yukthix/hiring-design-map.md). Offer pay becomes CTC lines kept per version (each change is a new version; history
-- kept); an older free-text offer has no versions and reads as version 0 from its text. Conditions (background check,
-- documents, notice) are tracked until met or waived with a reason. E-sign only when the company's offer template
-- switches it on; accepting by the link stays the default. Schema only: no data is written.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "offers" ADD COLUMN "grade_id" UUID;
ALTER TABLE "offers" ADD COLUMN "current_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "offers" ADD COLUMN "template_id" UUID;
ALTER TABLE "offers" ADD COLUMN "wf_request_id" UUID;
ALTER TABLE "offers" ADD COLUMN "esign" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "offers" ADD COLUMN "esign_evidence" JSONB;
ALTER TABLE "offers" ADD COLUMN "created_by" UUID;
ALTER TABLE "offers" ADD CONSTRAINT "offers_current_version_check" CHECK ("current_version" >= 0);

ALTER TABLE "offer_templates" ADD COLUMN "esign" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "offer_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "annual_ctc" DECIMAL(14,2) NOT NULL,
    "variable_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "joining_bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "clawback_months" INTEGER,
    "salary_template_version_id" UUID NOT NULL,
    "grade_id" UUID,
    "band_min" DECIMAL(14,2),
    "band_max" DECIMAL(14,2),
    "band_position" VARCHAR(10) NOT NULL,
    "lines" JSONB NOT NULL,
    "monthly_gross" DECIMAL(14,2) NOT NULL,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "location_id" UUID,
    "letter_kind" VARCHAR(10) NOT NULL DEFAULT 'offer',
    "note" VARCHAR(500),
    "needs_approval" BOOLEAN NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offer_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offer_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "offer_versions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "offer_versions_version_check" CHECK ("version" >= 1),
    CONSTRAINT "offer_versions_amounts_check" CHECK ("annual_ctc" > 0 AND "variable_pay" >= 0 AND "joining_bonus" >= 0),
    CONSTRAINT "offer_versions_clawback_check" CHECK ("clawback_months" IS NULL OR "clawback_months" BETWEEN 1 AND 60),
    CONSTRAINT "offer_versions_band_check" CHECK ("band_position" IN ('within', 'above', 'below', 'none')),
    CONSTRAINT "offer_versions_kind_check" CHECK ("letter_kind" IN ('offer', 'loi'))
);
CREATE UNIQUE INDEX "offer_versions_offer_version_key" ON "offer_versions" ("offer_id", "version");
CREATE INDEX "offer_versions_org_offer_idx" ON "offer_versions" ("organization_id", "offer_id");
ALTER TABLE "offer_versions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "offer_versions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

CREATE TABLE "offer_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "due_on" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "reason" VARCHAR(500),
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offer_conditions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offer_conditions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "offer_conditions_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "offer_conditions_status_check" CHECK ("status" IN ('open', 'met', 'waived')),
    CONSTRAINT "offer_conditions_waive_reason_check" CHECK ("status" <> 'waived' OR length(trim("reason")) >= 3)
);
CREATE INDEX "offer_conditions_org_offer_idx" ON "offer_conditions" ("organization_id", "offer_id");
ALTER TABLE "offer_conditions" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "offer_conditions"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
