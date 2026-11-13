-- ITSM answer 2056: a change's known-issue notice limited to one location (when the desk limits notices by location).
ALTER TABLE "sd_changes" ADD COLUMN "notice_location_id" UUID;
