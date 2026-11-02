-- PPL-44 Trading window (SEBI PIT Regulations 2015, Sch. B cl. 4): the compliance officer closes the trading window for
-- set periods (for example from the quarter end until results are out). The company starts with none. While a window is
-- closed, designated persons cannot ask for pre-clearance and none is approved. A period is removed, never deleted.
CREATE TABLE "trading_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),
    "removed_by" UUID,
    CONSTRAINT "trading_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trading_windows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trading_windows_dates_check" CHECK ("ends_on" >= "starts_on"),
    CONSTRAINT "trading_windows_reason_check" CHECK (char_length(btrim("reason")) >= 3)
);
CREATE INDEX "trading_windows_org_idx" ON "trading_windows"("organization_id", "starts_on");
REVOKE DELETE, TRUNCATE ON TABLE "trading_windows" FROM app_runtime;

ALTER TABLE "trading_windows" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "trading_windows"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "trading_windows" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
