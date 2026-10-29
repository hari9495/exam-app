-- Founder decisions, 29 Oct 2026 (docs/yukthix/time-design-map.md).
SELECT set_config('app.is_super_admin', 'on', true);

-- Decision 5: approving an attendance lock (the two-step flow, TIM-11) has its own key, given to the Payroll role. Every
-- company role that could approve a lock until now (it held payroll.correction.approve) gets the new key, so nobody
-- loses the power on the day of the change; from now on a company may take it from or give it to any role.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'attendance.lock.approve', 'Approve the lock of an attendance month that HR sent (two-step lock, needs a fresh second sign-in step)')
ON CONFLICT DO NOTHING;

UPDATE "permission_profiles" p
SET "permissions_json" = n."keys",
    "template_set" = CASE WHEN p."template_set" IS NOT NULL AND p."permissions_json"::jsonb = p."template_set"::jsonb THEN n."keys" ELSE p."template_set" END
FROM (
  SELECT "id", (SELECT jsonb_agg(k ORDER BY k) FROM (SELECT jsonb_array_elements_text("permissions_json"::jsonb) AS k UNION SELECT 'attendance.lock.approve') x)::text AS "keys"
  FROM "permission_profiles"
  WHERE "permissions_json"::jsonb ? 'payroll.correction.approve' AND NOT ("permissions_json"::jsonb ? 'attendance.lock.approve')
) n
WHERE p."id" = n."id";

-- Decision 6: withdrawing presence consent deletes the person's presence trail (DPDP Act 2023 s.6(4)); attendance days
-- stay. Rows may be deleted only once the person has no consent in force (the withdrawal sets it first, in the same
-- transaction); a company removed as a whole (super admin) cascades as before. Updates stay refused.
CREATE OR REPLACE FUNCTION yx_presence_signals_erase_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (SELECT app_is_super_admin()) AND EXISTS (
    SELECT 1 FROM "presence_consents" c WHERE c."organization_id" = OLD."organization_id" AND c."employee_id" = OLD."employee_id" AND c."withdrawn_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'presence states are deleted only when the person withdraws consent' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER presence_signals_erase_guard BEFORE DELETE ON "presence_signals" FOR EACH ROW EXECUTE FUNCTION yx_presence_signals_erase_guard();
GRANT DELETE ON TABLE "presence_signals" TO app_runtime;
