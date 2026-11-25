-- YukthiX console C-8, YX-10 incidents (and answer 1124): staff open an incident (title, severity, affected products) and
-- post status updates; a second staff member approves each update before companies see it in the availability banner.
-- An incident marked as a security breach and linked to a containment gets reminders before the CERT-In and DPDP due
-- times (the containment's clocks, set from the platform settings), by the lead time in
-- `incident.breach_reminder_lead_hours`.
--
-- Staff-only data (the breach link names a contained company): only the platform (super-admin) context reads or writes
-- it; companies get the banner through /availability, read by the service. Never deleted.
-- Writes data (the key and the setting), so the platform context is set first.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "platform_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "number" SERIAL NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "severity" SMALLINT NOT NULL,
    "products" TEXT[] NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "security_breach" BOOLEAN NOT NULL DEFAULT false,
    "containment_id" UUID,
    "certin_reminded_at" TIMESTAMPTZ(3),
    "dpdp_reminded_at" TIMESTAMPTZ(3),
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "platform_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_incidents_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id"),
    CONSTRAINT "platform_incidents_containment_fkey" FOREIGN KEY ("containment_id") REFERENCES "company_containments"("id"),
    CONSTRAINT "platform_incidents_severity_check" CHECK ("severity" BETWEEN 1 AND 3),
    CONSTRAINT "platform_incidents_status_check" CHECK ("status" IN ('open', 'resolved')),
    CONSTRAINT "platform_incidents_products_check" CHECK (cardinality("products") BETWEEN 1 AND 20),
    CONSTRAINT "platform_incidents_title_check" CHECK (char_length(btrim("title")) BETWEEN 3 AND 120),
    -- Only a security breach is linked to a containment.
    CONSTRAINT "platform_incidents_breach_check" CHECK ("containment_id" IS NULL OR "security_breach")
);
CREATE UNIQUE INDEX "platform_incidents_number_key" ON "platform_incidents" ("number");

CREATE TABLE "platform_incident_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "incident_id" UUID NOT NULL,
    "stage" VARCHAR(15) NOT NULL,
    "impact" VARCHAR(500) NOT NULL,
    "action" VARCHAR(300) NOT NULL,
    "next_update_at" TIMESTAMPTZ(3),
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "written_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_incident_updates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_incident_updates_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "platform_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "platform_incident_updates_written_by_fkey" FOREIGN KEY ("written_by") REFERENCES "users"("id"),
    CONSTRAINT "platform_incident_updates_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id"),
    CONSTRAINT "platform_incident_updates_stage_check" CHECK ("stage" IN ('investigating', 'identified', 'monitoring', 'resolved')),
    CONSTRAINT "platform_incident_updates_status_check" CHECK ("status" IN ('pending', 'posted', 'sent_back')),
    -- The approver is never the writer.
    CONSTRAINT "platform_incident_updates_four_eyes_check" CHECK ("reviewed_by" IS NULL OR "reviewed_by" <> "written_by")
);
CREATE INDEX "platform_incident_updates_incident_id_created_at_idx" ON "platform_incident_updates" ("incident_id", "created_at");
-- At most one update waits for approval per incident.
CREATE UNIQUE INDEX "platform_incident_updates_one_pending" ON "platform_incident_updates" ("incident_id") WHERE "status" = 'pending';

ALTER TABLE "platform_incidents" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_incidents_platform ON "platform_incidents" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
ALTER TABLE "platform_incident_updates" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_incident_updates_platform ON "platform_incident_updates" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "platform_incidents", "platform_incident_updates" FROM app_runtime;

-- Answer 1124: the reminder lead time (a platform setting with a default; 0 means at the due time).
INSERT INTO "platform_settings" ("key", "value", "label") VALUES
  ('incident.breach_reminder_lead_hours', '1', 'Breach reminders: hours before the CERT-In and DPDP due times')
ON CONFLICT ("key") DO NOTHING;

-- The console key (also in prisma/seed.ts). Staff role (answer 1058): Security lead. Every platform.* key is staff only.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'platform.incidents.manage', 'Open incidents, post and approve status updates, and link a security breach to a containment (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.incidents.manage'
ON CONFLICT DO NOTHING;
