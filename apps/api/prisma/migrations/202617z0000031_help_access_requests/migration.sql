-- Help and onboarding H-2 (founder answers 946 and 947, 11 Nov 2026).
-- 946: a general "Request access" from any "You don't have access" page: a reason and how long (up to the company's
--      "Longest access"). A System Admin (access.role.manage) approves with a role grant that ends by itself on its last
--      day (a Confidential role still waits for a second admin), or refuses with a reason. Nobody decides their own.
-- 947: every Not found answer to a signed-in person carries a short reference support can look up: who, when and which
--      address. It is written the same whether the record is missing or in another company, so it never tells them apart.

CREATE TABLE "access_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "page" VARCHAR(300) NOT NULL,
    "what" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "days" INTEGER NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "grant_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "access_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "access_requests_requester_fkey" FOREIGN KEY ("organization_id", "requested_by") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "access_requests_grant_fkey" FOREIGN KEY ("grant_id") REFERENCES "role_grants"("id"),
    CONSTRAINT "access_requests_page_check" CHECK ("page" LIKE '/%'),
    CONSTRAINT "access_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500),
    CONSTRAINT "access_requests_days_check" CHECK ("days" BETWEEN 1 AND 366),
    CONSTRAINT "access_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'refused')),
    CONSTRAINT "access_requests_approved_check" CHECK (("status" = 'approved') = ("grant_id" IS NOT NULL)),
    CONSTRAINT "access_requests_decided_check" CHECK (("status" = 'pending') = ("decided_by" IS NULL)),
    -- Nobody decides their own request.
    CONSTRAINT "access_requests_own_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "requested_by")
);
-- One open request per person and page.
CREATE UNIQUE INDEX "access_requests_open_key" ON "access_requests"("organization_id", "requested_by", "page") WHERE "status" = 'pending';
CREATE INDEX "access_requests_status_idx" ON "access_requests"("organization_id", "status", "created_at");
REVOKE DELETE, TRUNCATE ON TABLE "access_requests" FROM app_runtime;

ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "access_requests"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

CREATE TABLE "not_found_refs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "user_id" UUID,
    "path" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "not_found_refs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "not_found_refs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "not_found_refs_code_check" CHECK ("code" ~ '^NF-[A-HJ-NP-Z2-9]{6}$')
);
CREATE UNIQUE INDEX "not_found_refs_code_key" ON "not_found_refs"("organization_id", "code");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "not_found_refs" FROM app_runtime;

ALTER TABLE "not_found_refs" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "not_found_refs"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
