-- PAY-36 "Mark remitted" (builder 2, round 2): the payment of a month's union check-off to the union, recorded once per
-- union and month. The amount is the approved check-off's total for that union (worked out by the server, never typed).
--   RLS as the rest of payroll: tenant isolation, the support exclusion and the pay guard on the legal entity.

CREATE TABLE "union_remittances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "union_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "reference" VARCHAR(60) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "union_remittances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "union_remittances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "union_remittances_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "union_remittances_union_fkey" FOREIGN KEY ("union_id") REFERENCES "unions"("id") ON DELETE CASCADE,
    CONSTRAINT "union_remittances_check" CHECK ("amount" > 0 AND "paid_on" >= "month" AND extract(day FROM "month") = 1)
);
CREATE UNIQUE INDEX "union_remittances_key" ON "union_remittances" ("organization_id", "union_id", "month");

ALTER TABLE "union_remittances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "union_remittances" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "union_remittances"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "union_remittances" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY pay_guard ON "union_remittances" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
