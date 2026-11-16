-- ITSM answer 2071: a desk whose only IT lead raised the change falls back to the desk admins for the IT lead step
-- (never the person who raised it). A desk setting, on by default.
ALTER TABLE "sd_itsm_settings" ADD COLUMN "lead_fallback_admin" BOOLEAN NOT NULL DEFAULT true;
