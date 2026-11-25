-- Founder answer 795 (11 Nov 2026): a role nobody holds can be deleted. A role with past grants is archived instead
-- (its grants keep their history and point at it); archived roles are left out of every list and cannot be granted.
ALTER TABLE "permission_profiles" ADD COLUMN "archived_at" TIMESTAMPTZ(3);
