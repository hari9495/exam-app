-- Helpdesk (founder answer 1646): outside its calendar's working time a desk says it is closed, with its next opening
-- time, on the help centre and the portal. The message is a desk setting ({opens} becomes the next opening time). A
-- ticket raised while the desk is closed is flagged "raised outside hours".
ALTER TABLE "sd_desks" ADD COLUMN "closed_message" VARCHAR(300) NOT NULL DEFAULT 'We''re closed now. We open again {opens}. You can still raise a ticket; we answer it when we open.';
ALTER TABLE "sd_desks" ADD CONSTRAINT "sd_desks_closed_message_check" CHECK (length(btrim("closed_message")) >= 2);
ALTER TABLE "sd_tickets" ADD COLUMN "raised_outside_hours" BOOLEAN NOT NULL DEFAULT false;
