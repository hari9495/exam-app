-- Helpdesk answer 1843: a desk field may be required before a ticket is solved (sd_ticket_fields already has RLS).
ALTER TABLE "sd_ticket_fields" ADD COLUMN "required_to_solve" BOOLEAN NOT NULL DEFAULT false;
-- Agents cannot fill a field only team leads see, so it cannot be required for solving.
ALTER TABLE "sd_ticket_fields" ADD CONSTRAINT "sd_ticket_fields_required_check" CHECK (NOT ("required_to_solve" AND "visibility" = 'leads'));
