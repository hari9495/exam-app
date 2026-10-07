-- W-006: a verified email domain is re-checked on a schedule (DNS TXT still there?). After
-- DOMAIN_RECHECK_MAX_FAILURES consecutive real misses (not transient DNS errors) it lapses: it stops
-- routing sign-ins at once and the company's admins are told. Checking it again restores it.
-- The table's RLS (tenant_isolation, forced) is unchanged and covers the new columns.
ALTER TABLE "verified_domains"
  ADD COLUMN "last_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN "failed_checks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lapsed_at" TIMESTAMPTZ(3);
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_failed_checks_check" CHECK ("failed_checks" >= 0);
