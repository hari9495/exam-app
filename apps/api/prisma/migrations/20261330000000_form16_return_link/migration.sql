-- CMP-06 WrongQuarter: the salary TDS return a legal entity's year-end certificates (Form 16 / Form 130) are issued
-- against. One link per entity and tax year; changing it bumps the version (two people at once: the second is refused).
-- A link to anything but the year's filed Q4 return blocks issuing. Never deleted; every change is audited.

CREATE TABLE "form16_return_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "tax_year" VARCHAR(7) NOT NULL,
    "tds_return_id" UUID NOT NULL,
    "linked_by" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "form16_return_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form16_return_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "form16_return_links_return_fkey" FOREIGN KEY ("organization_id", "tds_return_id") REFERENCES "tds_returns"("organization_id", "id"),
    CONSTRAINT "form16_return_links_tax_year_check" CHECK ("tax_year" ~ '^\d{4}-\d{2}$'),
    CONSTRAINT "form16_return_links_key" UNIQUE ("organization_id", "legal_entity_id", "tax_year")
);
REVOKE DELETE, TRUNCATE ON TABLE "form16_return_links" FROM app_runtime;

ALTER TABLE "form16_return_links" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "form16_return_links"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "form16_return_links" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
-- The entity's payroll and compliance staff only, as for the returns themselves.
CREATE POLICY pay_guard ON "form16_return_links" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
