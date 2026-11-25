-- PPL-30 "Share an expiring link" (founder 26 Oct 2026): an employee shares one of their own issued letters or pay
-- documents with an outsider (a bank, a visa office). Only the hash of the token is kept; the link opens that one
-- document read-only until it expires or the employee stops it, and every open is audited.
CREATE TABLE "document_shares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "source_id" UUID NOT NULL,
    "employee_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "opens" INTEGER NOT NULL DEFAULT 0,
    "last_opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_shares_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "document_shares_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "document_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "document_shares_source_check" CHECK ("source" IN ('letter', 'pay') AND ("source" = 'pay') = ("employee_id" IS NOT NULL)),
    CONSTRAINT "document_shares_expiry_check" CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '30 days')
);
CREATE INDEX "document_shares_owner_idx" ON "document_shares"("organization_id", "user_id", "expires_at");
REVOKE DELETE, TRUNCATE ON TABLE "document_shares" FROM app_runtime;

ALTER TABLE "document_shares" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "document_shares"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "document_shares" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
