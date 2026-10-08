-- Founder decision 8 Oct 2026 (directory sync, SD-1.29): leaving a directory group ends only the desk seats the
-- directory itself gave; a seat an admin gave by hand stays. Every seat records who gave it: an admin ('manual', also
-- every seat made before today) or a directory source ('directory', with the source).
ALTER TABLE "sd_desk_members"
  ADD COLUMN "granted_by" VARCHAR(10) NOT NULL DEFAULT 'manual',
  ADD COLUMN "directory_source_id" UUID,
  ADD CONSTRAINT "sd_desk_members_granted_by_check" CHECK ("granted_by" IN ('manual', 'directory')),
  ADD CONSTRAINT "sd_desk_members_directory_check" CHECK (("granted_by" = 'directory') = ("directory_source_id" IS NOT NULL)),
  ADD CONSTRAINT "sd_desk_members_directory_fkey" FOREIGN KEY ("organization_id", "directory_source_id") REFERENCES "sd_directory_sources"("organization_id", "id");
