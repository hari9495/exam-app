-- Helpdesk (founder answers 1641, 1650): a desk's own ticket fields (text, number, date or drop-down), for every ticket
-- of the desk or for one ticket type; a drop-down may narrow the next one (the forms engine's dependent list). Each
-- field shows to everyone on the ticket, to the desk's staff only (hidden from the requester), or to its team leads
-- only. The values live on the ticket itself (sd_tickets.field_values, keyed by the field's key), so the ticket's own
-- row security covers them; the API removes what a viewer may not see.
CREATE TABLE "sd_ticket_fields" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "desk_id" UUID NOT NULL,
  "ticket_type_id" UUID,
  "key" VARCHAR(40) NOT NULL,
  "label" VARCHAR(100) NOT NULL,
  "field_type" VARCHAR(10) NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "depends_on" VARCHAR(40),
  "options_by" JSONB,
  "visibility" VARCHAR(10) NOT NULL DEFAULT 'all',
  "sort_order" SMALLINT NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "sd_ticket_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sd_ticket_fields_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id") ON DELETE CASCADE,
  CONSTRAINT "sd_ticket_fields_type_check" CHECK ("field_type" IN ('text', 'number', 'date', 'choice')),
  CONSTRAINT "sd_ticket_fields_visibility_check" CHECK ("visibility" IN ('all', 'agents', 'leads')),
  CONSTRAINT "sd_ticket_fields_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]{0,39}$')
);
CREATE UNIQUE INDEX "sd_ticket_fields_key_key" ON "sd_ticket_fields"("organization_id", "desk_id", "key");
CREATE INDEX "sd_ticket_fields_desk_idx" ON "sd_ticket_fields"("organization_id", "desk_id", "sort_order");

ALTER TABLE "sd_tickets" ADD COLUMN "field_values" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "sd_ticket_fields" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sd_ticket_fields"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
