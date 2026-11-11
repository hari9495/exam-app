-- Help and onboarding H-2b (founder answers 973 and 974, 11 Nov 2026).
-- 973: a request still waiting 2 working days after it was sent reminds the System Admins once. reminded_at is set in
--      the same statement that claims the reminder, so a rerun (or a second server) never sends it again.
-- 974: Not found references are deleted after the company's period (help.not_found.keep_days, 90 by default). The app
--      still may not delete them: only this function may, inside one company's own context, older than 30 days at least.

ALTER TABLE "access_requests" ADD COLUMN "reminded_at" TIMESTAMPTZ(3);

CREATE INDEX "not_found_refs_created_idx" ON "not_found_refs"("organization_id", "created_at");

CREATE OR REPLACE FUNCTION purge_not_found_refs(p_days INTEGER) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  org UUID := app_current_org();
  n BIGINT;
BEGIN
  IF org IS NULL THEN
    RAISE EXCEPTION 'Not found references are deleted inside one company only';
  END IF;
  IF p_days IS NULL OR p_days < 30 THEN
    RAISE EXCEPTION 'Not found references are kept at least 30 days';
  END IF;
  DELETE FROM not_found_refs WHERE organization_id = org AND created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION purge_not_found_refs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_not_found_refs(INTEGER) TO app_runtime;
