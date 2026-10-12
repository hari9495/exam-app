-- Expenses batch E4 (M05-BUILD-DESIGN §5.5, §9.4, §10, §11.3; YX-EXP-08, YX-EXP-09): trips with legs and bookings,
-- advances (for a trip or standing imprest) and their settlement ledger. Claims link to a trip or an imprest advance.
-- Forced RLS + tenant_isolation, and support sessions never read them (§5.8). Pay currency only (forex is E5).
-- Recovery from salary uses the payroll loan engine once payroll adds the 'expense' loan type (§22.1, change 5).

CREATE TABLE "trips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "purpose" VARCHAR(300) NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "estimate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_requested" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "booking_needed" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "wf_request_id" UUID,
    "decision_note" VARCHAR(500),
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trips_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "trips_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "trips_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "trips_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "trips_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled', 'closed')),
    CONSTRAINT "trips_dates_check" CHECK ("to_on" >= "from_on"),
    CONSTRAINT "trips_amounts_check" CHECK ("estimate" >= 0 AND "advance_requested" >= 0),
    CONSTRAINT "trips_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "trips_employee_idx" ON "trips" ("organization_id", "employee_id", "status");

CREATE TABLE "trip_legs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "seq" SMALLINT NOT NULL,
    "from_city" VARCHAR(60) NOT NULL,
    "to_city" VARCHAR(60) NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'IN',
    "depart_on" DATE NOT NULL,
    "mode" VARCHAR(6) NOT NULL,
    "stay_nights" SMALLINT NOT NULL DEFAULT 0,
    "tier_id" UUID,
    CONSTRAINT "trip_legs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_legs_seq_key" UNIQUE ("trip_id", "seq"),
    CONSTRAINT "trip_legs_trip_fkey" FOREIGN KEY ("organization_id", "trip_id") REFERENCES "trips"("organization_id", "id"),
    CONSTRAINT "trip_legs_tier_fkey" FOREIGN KEY ("organization_id", "tier_id") REFERENCES "city_tiers"("organization_id", "id"),
    CONSTRAINT "trip_legs_mode_check" CHECK ("mode" IN ('air', 'rail', 'road', 'other')),
    CONSTRAINT "trip_legs_nights_check" CHECK ("stay_nights" BETWEEN 0 AND 90),
    CONSTRAINT "trip_legs_country_check" CHECK ("country" ~ '^[A-Z]{2}$')
);

CREATE TABLE "trip_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "file_id" UUID,
    "provider" VARCHAR(30),
    "provider_ref" VARCHAR(80),
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_by" VARCHAR(8) NOT NULL,
    "booked_by" UUID NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trip_bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "trip_bookings_trip_fkey" FOREIGN KEY ("organization_id", "trip_id") REFERENCES "trips"("organization_id", "id"),
    CONSTRAINT "trip_bookings_file_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "files"("organization_id", "id"),
    CONSTRAINT "trip_bookings_kind_check" CHECK ("kind" IN ('ticket', 'hotel', 'cab', 'visa', 'other')),
    CONSTRAINT "trip_bookings_paid_check" CHECK ("paid_by" IN ('company', 'employee')),
    CONSTRAINT "trip_bookings_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "trip_bookings_trip_idx" ON "trip_bookings" ("organization_id", "trip_id");

CREATE TABLE "expense_advances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employment_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "trip_id" UUID,
    "kind" VARCHAR(8) NOT NULL,
    "purpose" VARCHAR(300) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "requested" DECIMAL(14,2) NOT NULL,
    "amount" DECIMAL(14,2),
    "change_reason" VARCHAR(300),
    "status" VARCHAR(10) NOT NULL DEFAULT 'requested',
    "wf_request_id" UUID,
    "paid_on" DATE,
    "paid_ref" VARCHAR(80),
    "paid_by" UUID,
    "settle_by" DATE,
    "reminded_on" DATE,
    "overdue_on" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_advances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expense_advances_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "expense_advances_employment_fkey" FOREIGN KEY ("organization_id", "employment_id") REFERENCES "employments"("organization_id", "id"),
    CONSTRAINT "expense_advances_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "expense_advances_trip_fkey" FOREIGN KEY ("organization_id", "trip_id") REFERENCES "trips"("organization_id", "id"),
    CONSTRAINT "expense_advances_kind_check" CHECK ("kind" IN ('trip', 'imprest') AND (("kind" = 'trip') = ("trip_id" IS NOT NULL))),
    CONSTRAINT "expense_advances_status_check" CHECK ("status" IN ('requested', 'approved', 'rejected', 'paid', 'settled', 'to_fnf', 'cancelled')),
    CONSTRAINT "expense_advances_amounts_check" CHECK ("requested" > 0 AND ("amount" IS NULL OR ("amount" > 0 AND "amount" <= "requested"))),
    CONSTRAINT "expense_advances_change_check" CHECK ("amount" IS NULL OR "amount" = "requested" OR "change_reason" IS NOT NULL),
    CONSTRAINT "expense_advances_paid_check" CHECK ("status" NOT IN ('paid', 'settled') OR ("paid_on" IS NOT NULL AND "amount" IS NOT NULL)),
    CONSTRAINT "expense_advances_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
CREATE INDEX "expense_advances_employee_idx" ON "expense_advances" ("organization_id", "employee_id", "status");
-- One advance per trip (YX-EXP-08: the trip's approval makes it).
CREATE UNIQUE INDEX "expense_advances_trip_key" ON "expense_advances" ("organization_id", "trip_id") WHERE "trip_id" IS NOT NULL;

CREATE TABLE "advance_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "advance_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "claim_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "on" DATE NOT NULL,
    "ref" VARCHAR(80),
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "advance_settlements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "advance_settlements_advance_fkey" FOREIGN KEY ("organization_id", "advance_id") REFERENCES "expense_advances"("organization_id", "id"),
    CONSTRAINT "advance_settlements_claim_fkey" FOREIGN KEY ("organization_id", "claim_id") REFERENCES "expense_claims"("organization_id", "id"),
    CONSTRAINT "advance_settlements_kind_check" CHECK ("kind" IN ('claim', 'return', 'recovery', 'fnf', 'exchange_difference')),
    CONSTRAINT "advance_settlements_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "advance_settlements_claim_check" CHECK (("kind" = 'claim') = ("claim_id" IS NOT NULL))
);
CREATE INDEX "advance_settlements_advance_idx" ON "advance_settlements" ("organization_id", "advance_id");
-- A claim settles an advance once.
CREATE UNIQUE INDEX "advance_settlements_claim_key" ON "advance_settlements" ("organization_id", "claim_id") WHERE "claim_id" IS NOT NULL;

-- Claims link to their trip or to a standing imprest advance (§3: the trip is the parent of its claims).
ALTER TABLE "expense_claims" ADD COLUMN "advance_id" UUID;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_trip_fkey" FOREIGN KEY ("organization_id", "trip_id") REFERENCES "trips"("organization_id", "id");
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_advance_fkey" FOREIGN KEY ("organization_id", "advance_id") REFERENCES "expense_advances"("organization_id", "id");

-- ---------------------------------------------------------------------------------------------- RLS (§5.8)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trips', 'trip_legs', 'trip_bookings', 'expense_advances', 'advance_settlements']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
-- Nothing about a trip's money is erased (§5.1): bookings are removed with removed_at.
REVOKE DELETE, TRUNCATE ON TABLE "trips" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "trip_bookings" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "expense_advances" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "advance_settlements" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- permission keys (§16)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'travel.booking.manage', 'Add bookings (tickets, hotels) to the trips of the people in scope'),
  (gen_random_uuid(), 'expense.payout.manage', 'Pay approved expense advances and record their returns, for the legal entity')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('travel.booking.manage', 'expense.payout.manage')
ON CONFLICT DO NOTHING;
