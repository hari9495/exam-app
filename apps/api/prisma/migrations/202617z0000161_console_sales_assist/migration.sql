-- YukthiX console C-8, YX-13 (and founder answer 1210): the sales-assist queue. A company person presses Talk to us on a
-- nudge card shown to them (the drawn PLT-41 dialog: phone, what to discuss); the request lands in the staff queue for
-- that company and feature, with the size band and set-up share at the time, a reply due time
-- (`sales.reply_hours`, platform setting, default 24), an owner and an outcome. All audited.
--
-- Staff-only data (a person's name and phone): only the platform (super-admin) context reads or writes it; the company
-- side writes through the service. Never deleted (it goes with its company).
-- Writes data (the key), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "sales_assist_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "feature_key" VARCHAR(60),
    "nudge_id" UUID,
    "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "phone" VARCHAR(15) NOT NULL,
    "note" VARCHAR(500),
    "requested_by" UUID,
    "requested_by_name" VARCHAR(200) NOT NULL,
    "employees" INTEGER NOT NULL DEFAULT 0,
    "setup_pct" SMALLINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "owner_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'open',
    "outcome_note" VARCHAR(500),
    "decided_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "sales_assist_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_assist_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
    CONSTRAINT "sales_assist_requests_feature_fkey" FOREIGN KEY ("feature_key") REFERENCES "feature_flags"("key"),
    CONSTRAINT "sales_assist_requests_nudge_fkey" FOREIGN KEY ("nudge_id") REFERENCES "feature_nudges"("id"),
    CONSTRAINT "sales_assist_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL,
    CONSTRAINT "sales_assist_requests_owner_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id"),
    CONSTRAINT "sales_assist_requests_status_check" CHECK ("status" IN ('open', 'demo_booked', 'converted', 'lost')),
    CONSTRAINT "sales_assist_requests_topics_check" CHECK ("topics" <@ ARRAY['migration', 'parallel_run', 'entities', 'pricing']::TEXT[]),
    CONSTRAINT "sales_assist_requests_phone_check" CHECK ("phone" ~ '^[6-9][0-9]{9}$'),
    -- An outcome other than open has an owner.
    CONSTRAINT "sales_assist_requests_owner_check" CHECK ("status" = 'open' OR "owner_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "sales_assist_requests_number_key" ON "sales_assist_requests" ("number");
-- One open request per company and feature.
CREATE UNIQUE INDEX "sales_assist_requests_one_open" ON "sales_assist_requests" ("organization_id", "feature_key") WHERE "status" = 'open';
ALTER TABLE "sales_assist_requests" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_assist_platform ON "sales_assist_requests" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "sales_assist_requests" FROM app_runtime;

-- The console key (also in prisma/seed.ts). Staff role (answers 1058, 1086): Customer success.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.sales.work', 'Work the sales-assist queue: take a request and record its outcome (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "platform_role_keys" ("role", "key") VALUES ('customer_success', 'platform.sales.work') ON CONFLICT DO NOTHING;
