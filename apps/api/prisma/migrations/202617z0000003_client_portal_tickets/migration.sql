-- Founder answer 491 (11 Nov 2026): a client contact raises and follows tickets in the staffing client portal. The
-- tickets are the Helpdesk's own (sd_tickets); this table only says which client and contact a ticket belongs to, so a
-- contact sees their own client's tickets and nothing else. No data is written here.
CREATE TABLE "staffing_client_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staffing_client_tickets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staffing_client_tickets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_client_tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "staffing_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_client_tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "staffing_client_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staffing_client_tickets_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "sd_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "staffing_client_tickets_ticket_key" ON "staffing_client_tickets" ("ticket_id");
CREATE INDEX "staffing_client_tickets_client_idx" ON "staffing_client_tickets" ("organization_id", "client_id", "created_at");
ALTER TABLE "staffing_client_tickets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "staffing_client_tickets" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
