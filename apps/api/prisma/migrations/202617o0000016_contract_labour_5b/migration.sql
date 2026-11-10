-- Contract labour CL-5, founder answers 741 and 743. The muster roll becomes a fifth monthly proof (which proofs are
-- required is the company setting clra.required_proofs). The liability alerts the compliance owners were told about,
-- so each alert is emailed once.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "contractor_pack_items" DROP CONSTRAINT "contractor_pack_items_kind_check";
ALTER TABLE "contractor_pack_items" ADD CONSTRAINT "contractor_pack_items_kind_check" CHECK ("kind" IN ('pf_challan', 'esi_challan', 'wage_register', 'bank_proof', 'muster_roll'));

CREATE TABLE "clra_alert_notices" (
    "organization_id" UUID NOT NULL,
    "alert_id" VARCHAR(200) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "clra_alert_notices_pkey" PRIMARY KEY ("organization_id", "alert_id")
);
ALTER TABLE "clra_alert_notices" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clra_alert_notices" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
