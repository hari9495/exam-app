-- Step 3, the YukthiX platform console (P14 §3–§7, YX-CONSOLE-01/02, YX-TEN-*, YX-BILL-01/13/14), support sessions
-- (P02 Q8 / YX-SEC-20, P01 §4 row 2) and the console's permission keys.
--
-- Platform tables (products, product_prices) carry no organization_id: they are the catalogue (P07 YX-STAT-10
-- exemption). Company tables (organization_products, support_sessions) get the standard forced RLS.

-- ---------------------------------------------------------------------------------------------
-- 1. Company lifecycle (P14 §3: trial → active → suspended → closed). `status` stays the sign-in switch every guard
-- already reads (isOrganizationActive: only 'active' may sign in); `lifecycle` is the state the console moves. The
-- trigger keeps the two in step whichever one a caller changes, so the older status endpoints cannot drift them.
ALTER TABLE "organizations"
  ADD COLUMN "lifecycle" VARCHAR(16) NOT NULL DEFAULT 'active',
  ADD COLUMN "trial_ends_at" TIMESTAMPTZ(3),
  ADD COLUMN "trial_extended_at" TIMESTAMPTZ(3),
  ADD COLUMN "lifecycle_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "organizations" SET "lifecycle" = CASE "status" WHEN 'active' THEN 'active' WHEN 'deleted' THEN 'closed' ELSE 'suspended' END;
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_lifecycle_check" CHECK ("lifecycle" IN ('trial', 'active', 'suspended', 'closed')),
  ADD CONSTRAINT "organizations_trial_check" CHECK ("lifecycle" <> 'trial' OR "trial_ends_at" IS NOT NULL);

CREATE FUNCTION organizations_sync_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lifecycle IS DISTINCT FROM OLD.lifecycle THEN
    NEW.status := CASE WHEN NEW.lifecycle IN ('trial', 'active') THEN 'active' WHEN OLD.status = 'deleted' THEN 'deleted' ELSE 'suspended' END;
    NEW.lifecycle_changed_at := now();
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.lifecycle := CASE NEW.status
      WHEN 'active' THEN CASE WHEN OLD.lifecycle = 'trial' THEN 'trial' ELSE 'active' END
      WHEN 'deleted' THEN 'closed'
      ELSE 'suspended' END;
    NEW.lifecycle_changed_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organizations_sync_lifecycle BEFORE UPDATE ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION organizations_sync_lifecycle();

-- ---------------------------------------------------------------------------------------------
-- 2. Products and prices (YX-BILL-01: one plan per product, so the product is the plan; YX-BILL-14 published
-- prices with the per-product minimum). Prices are dated rows: the one in force is the latest valid_from on or
-- before today (IST). A price in force is never changed or removed (YX-BILL-13); a scheduled one may be withdrawn.
CREATE TABLE "products" (
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    -- What one billable unit is, in plain words: "employee", "agent".
    "unit" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "products_code_check" CHECK ("code" ~ '^[a-z][a-z0-9_]{1,31}$'),
    CONSTRAINT "products_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "products_unit_check" CHECK (char_length(btrim("unit")) BETWEEN 1 AND 40)
);

CREATE TABLE "product_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_code" VARCHAR(32) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    -- Per billable unit per month, before GST (D18b).
    "unit_price" NUMERIC(12, 2) NOT NULL,
    "minimum_monthly" NUMERIC(12, 2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_prices_product_fkey" FOREIGN KEY ("product_code") REFERENCES "products"("code"),
    CONSTRAINT "product_prices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "product_prices_currency_check" CHECK ("currency" IN ('INR', 'USD')),
    CONSTRAINT "product_prices_unit_price_check" CHECK ("unit_price" > 0 AND "unit_price" <= 1000000),
    CONSTRAINT "product_prices_minimum_check" CHECK ("minimum_monthly" >= 0 AND "minimum_monthly" <= 10000000),
    CONSTRAINT "product_prices_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX "product_prices_product_currency_from_key" ON "product_prices"("product_code", "currency", "valid_from");
REVOKE UPDATE, TRUNCATE ON TABLE "product_prices" FROM app_runtime;
CREATE FUNCTION product_prices_keep_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.valid_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'A price already in force is never removed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER product_prices_keep_history BEFORE DELETE ON "product_prices"
  FOR EACH ROW EXECUTE FUNCTION product_prices_keep_history();

-- Decided prices (PRICING-UNIT-ECONOMICS §2, P14 YX-BILL-14, M14 Q1): HRMS ₹99 / $1 per employee, minimum ₹499 /
-- $5; Service Desk ₹999 / $10 per agent, minimum ₹999 / $10.
INSERT INTO "products" ("code", "name", "unit") VALUES ('hrms', 'YukthiX HR', 'employee'), ('service_desk', 'YukthiX Service Desk', 'agent');
INSERT INTO "product_prices" ("product_code", "currency", "unit_price", "minimum_monthly", "valid_from", "reason") VALUES
  ('hrms', 'INR', 99, 499, DATE '2026-10-01', 'Launch price (PRICING-UNIT-ECONOMICS §2)'),
  ('hrms', 'USD', 1, 5, DATE '2026-10-01', 'Launch price (PRICING-UNIT-ECONOMICS §2)'),
  ('service_desk', 'INR', 999, 999, DATE '2026-10-01', 'Launch price (M14 Q1)'),
  ('service_desk', 'USD', 10, 10, DATE '2026-10-01', 'Launch price (M14 Q1)');

-- The products a company uses (P14 subscriptions, before billing exists).
CREATE TABLE "organization_products" (
    "organization_id" UUID NOT NULL,
    "product_code" VARCHAR(32) NOT NULL,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by" UUID,

    CONSTRAINT "organization_products_pkey" PRIMARY KEY ("organization_id", "product_code"),
    CONSTRAINT "organization_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "organization_products_product_fkey" FOREIGN KEY ("product_code") REFERENCES "products"("code"),
    CONSTRAINT "organization_products_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL
);

-- ---------------------------------------------------------------------------------------------
-- 3. Support sessions (P02 Q8, YX-SEC-20; P14 YX-CONSOLE-01). A YukthiX staff member asks, with a reason, for up to
-- 72 hours; a System Admin of the company approves (the window starts then) or declines. Only an approved session
-- inside its window lets the staff member open the company, read-only, with every request recorded in the company's
-- audit log. Rows are never deleted; the company reads its own through the standard tenant policy.
CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    -- Snapshots: the company cannot read the staff member's account row (RLS).
    "requested_by_name" VARCHAR(200) NOT NULL,
    "requested_by_email" VARCHAR(320) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "ticket" VARCHAR(40),
    "hours" SMALLINT NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'requested',
    "decided_by" UUID,
    "decided_by_name" VARCHAR(200),
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "ended_by" UUID,
    "ended_by_name" VARCHAR(200),
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "support_sessions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id"),
    -- The approver is a person of that company.
    CONSTRAINT "support_sessions_decided_by_fkey" FOREIGN KEY ("organization_id", "decided_by") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "support_sessions_status_check" CHECK ("status" IN ('requested', 'approved', 'declined', 'cancelled', 'ended', 'expired')),
    CONSTRAINT "support_sessions_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500),
    CONSTRAINT "support_sessions_ticket_check" CHECK ("ticket" IS NULL OR "ticket" ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$'),
    CONSTRAINT "support_sessions_hours_check" CHECK ("hours" BETWEEN 1 AND 72),
    CONSTRAINT "support_sessions_approved_check" CHECK ("status" <> 'approved' OR ("decided_by" IS NOT NULL AND "starts_at" IS NOT NULL AND "ends_at" IS NOT NULL)),
    -- Never longer than asked, never more than 72 hours (Q8).
    CONSTRAINT "support_sessions_window_check" CHECK ("ends_at" IS NULL OR ("ends_at" > "starts_at" AND "ends_at" <= "starts_at" + make_interval(hours => "hours"))),
    CONSTRAINT "support_sessions_four_eyes_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "requested_by")
);
CREATE INDEX "support_sessions_organization_created_idx" ON "support_sessions"("organization_id", "created_at" DESC);
CREATE INDEX "support_sessions_requested_by_idx" ON "support_sessions"("requested_by", "created_at" DESC);
-- One open request or session per staff member per company.
CREATE UNIQUE INDEX "support_sessions_open_key" ON "support_sessions"("organization_id", "requested_by") WHERE "status" IN ('requested', 'approved');
REVOKE DELETE, TRUNCATE ON TABLE "support_sessions" FROM app_runtime;

-- What was asked never changes, and a session only moves forward.
CREATE FUNCTION support_sessions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.ticket IS DISTINCT FROM OLD.ticket OR NEW.hours IS DISTINCT FROM OLD.hours
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'A support request cannot be changed after it is sent' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'requested' AND NEW.status IN ('approved', 'declined', 'cancelled', 'expired'))
    OR (OLD.status = 'approved' AND NEW.status IN ('ended', 'expired'))) THEN
    RAISE EXCEPTION 'A support session cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'requested' AND (NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.decided_by IS DISTINCT FROM OLD.decided_by) THEN
    RAISE EXCEPTION 'An approved window cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER support_sessions_guard BEFORE UPDATE ON "support_sessions"
  FOR EACH ROW EXECUTE FUNCTION support_sessions_guard();

-- Tenant isolation: the standard forced RLS + tenant_isolation policy.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['organization_products', 'support_sessions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- P01 §4 row 2 / P02 Q8: inside a support session (TenantPrismaService sets app.support_session), pay and the
-- Confidential / Special identity and bank data stay out of reach even if a code path forgets to mask them.
-- RESTRICTIVE, so it is ANDed with tenant_isolation; reads and writes alike.
CREATE FUNCTION app_support_session() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.support_session', true), '')::uuid $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compensations', 'grade_pay_ranges', 'employee_identifiers', 'employee_bank_accounts', 'employee_profile_requests']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Permission keys (also in prisma/seed.ts). The console keys are YukthiX staff only: never assignable to a
-- company role (assignable-permissions.ts). Approving support access is the company's System Admin's.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.companies.view', 'See companies, their lifecycle and products (YukthiX staff)'),
  (gen_random_uuid(), 'platform.companies.manage', 'Create companies and change their lifecycle (YukthiX staff)'),
  (gen_random_uuid(), 'platform.plans.manage', 'Set product prices (YukthiX staff)'),
  (gen_random_uuid(), 'platform.channels.manage', 'Manage the YukthiX shared message accounts (YukthiX staff)'),
  (gen_random_uuid(), 'platform.support.request', 'Ask a company for a support session and use it (YukthiX staff)'),
  (gen_random_uuid(), 'platform.audit.view', 'See the platform audit log (YukthiX staff)'),
  (gen_random_uuid(), 'org.support_access.approve', 'Approve, decline and end YukthiX support sessions')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions"
WHERE "key" IN ('platform.companies.view', 'platform.companies.manage', 'platform.plans.manage', 'platform.channels.manage', 'platform.support.request', 'platform.audit.view')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'org.support_access.approve'
ON CONFLICT DO NOTHING;
