-- Helpdesk answer 1894: the application owner the company's Service Desk owners were last warned about (left or
-- deactivated), so each departure is told once (sd_business_apps already has RLS).
ALTER TABLE "sd_business_apps" ADD COLUMN "owner_warned_for" UUID;
