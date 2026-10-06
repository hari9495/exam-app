-- Company-configurable account lockout (P12 YX-IAM-07, Q8; founder decision 6 Oct 2026).
-- The YukthiX floor: lock after at most 10 failures, for at least 15 minutes (a day at most).
-- Keep in step with TENANT_SECURITY_FLOOR (packages/shared).
ALTER TABLE "tenant_security_policies"
  ADD COLUMN "max_failed_attempts" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "lock_minutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "tenant_security_policies"
  ADD CONSTRAINT "tsp_max_failed_attempts_check" CHECK ("max_failed_attempts" BETWEEN 3 AND 10),
  ADD CONSTRAINT "tsp_lock_minutes_check" CHECK ("lock_minutes" BETWEEN 15 AND 1440);

-- An admin clearing a person's account lock is a login event too (YX-IAM-10).
ALTER TABLE "login_events" DROP CONSTRAINT "login_events_result_check";
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_result_check"
  CHECK ("result" IN ('success', 'failed', 'locked', 'mfa_failed', 'code_sent', 'unlocked'));
