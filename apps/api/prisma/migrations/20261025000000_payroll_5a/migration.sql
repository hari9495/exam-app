-- Step 5 · Payroll batch 5a (M03-BUILD-DESIGN §5.2, slices PAY-1.01 … PAY-1.12): locks, audit, documents.
--   pay guard     a second, RESTRICTIVE database guard on the tables that hold one person's pay: the row's own employee,
--                 or payroll staff of its legal entity (app.pay_entities, set per transaction from the P02 grants). No
--                 super-admin escape; support sessions excluded on every payroll table (P02 Q8).
--   pay periods   the step-4 attendance period locks become pay_periods (one lock model): rows kept, stages open →
--                 frozen → locked → filed, pay_period_stage() for the lock service, a history of every stage change,
--                 and the two-approval reopen request (P03, maker ≠ checker, YX-LOCK-05).
--   corrections   late requests and HR corrections on frozen / locked dates land in the next payroll (YX-LOCK-02/03);
--                 late device punches are held and applied by one audited HR backfill (YX-LOCK-09).
--   audit         a per-company hash chain on audit_logs (existing rows chained in a fixed order), append-only in the
--                 database, daily anchors, legal holds and archives (YX-AUD-02/03/08).
--   documents     issued pay documents: immutable, hashed, gap-free numbers per entity and kind, a verify code (P05).
--   files         exchange files (bank, statutory, journal …) with hash, rows and totals, single-use download links and a
--                 maker ≠ checker release (YX-INT-03).

-- ---------------------------------------------------------------------------------------------
-- 1. Pay visibility guard (PAY-1.01, §5.1)

/** Legal entities where the signed-in person holds a pay-reading key (set by the API per transaction; never for staff). */
CREATE FUNCTION app_pay_entities() RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT coalesce(NULLIF(current_setting('app.pay_entities', true), '')::uuid[], '{}')
$$;

/** The employee records of the signed-in person (their own login, or a person merged into it). */
CREATE FUNCTION app_current_employee_ids() RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(e.id), '{}') FROM employees e
  WHERE e.organization_id = app_current_org() AND app_current_user_id() IS NOT NULL
    AND (e.user_id = app_current_user_id() OR e.person_id = ANY (app_current_person_ids()))
$$;

/** An alumni or nominee pay-document session (PAY-1.10): the one employee whose documents it may read. */
CREATE FUNCTION app_pay_portal_employee() RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.pay_portal_employee', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Pay periods: the step-4 attendance locks become the one lock model (PAY-1.02, §3.3)

ALTER TABLE "period_locks" RENAME TO "pay_periods";
ALTER TABLE "pay_periods" RENAME CONSTRAINT "period_locks_pkey" TO "pay_periods_pkey";
ALTER TABLE "pay_periods" RENAME CONSTRAINT "period_locks_org_id_key" TO "pay_periods_org_id_key";
ALTER TABLE "pay_periods" RENAME CONSTRAINT "period_locks_organization_id_fkey" TO "pay_periods_organization_id_fkey";
ALTER TABLE "pay_periods" RENAME CONSTRAINT "period_locks_entity_fkey" TO "pay_periods_entity_fkey";
ALTER TABLE "pay_periods" RENAME CONSTRAINT "period_locks_month_check" TO "pay_periods_month_check";
ALTER TABLE "pay_periods" DROP CONSTRAINT "period_locks_key", DROP CONSTRAINT "period_locks_type_check", DROP CONSTRAINT "period_locks_stage_check";
ALTER TABLE "pay_periods" DROP COLUMN "period_type";
-- Pay groups arrive in batch 5b; until then a period is the legal entity's month (pay_group_id NULL).
ALTER TABLE "pay_periods"
  ADD COLUMN "pay_group_id" UUID,
  ADD COLUMN "cut_off_at" TIMESTAMPTZ(3),
  ADD COLUMN "locked_at" TIMESTAMPTZ(3),
  ADD COLUMN "locked_by" UUID,
  ADD COLUMN "locked_by_run_id" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "pay_periods_stage_check" CHECK ("stage" IN ('open', 'frozen', 'locked', 'filed'));
UPDATE "pay_periods" SET "locked_at" = "changed_at", "locked_by" = "changed_by" WHERE "stage" = 'locked';
CREATE UNIQUE INDEX "pay_periods_key" ON "pay_periods" ("organization_id", "legal_entity_id", "pay_group_id", "period_start") NULLS NOT DISTINCT;
ALTER TABLE "payroll_feed_rows" RENAME COLUMN "lock_id" TO "pay_period_id";
ALTER TABLE "payroll_feed_rows" RENAME CONSTRAINT "payroll_feed_rows_lock_fkey" TO "payroll_feed_rows_period_fkey";

/** The lock service (YX-LOCK-01): the stage of a legal entity's period on a date ('open' when there is no row). */
CREATE FUNCTION pay_period_stage(p_org UUID, p_entity UUID, p_on DATE) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT pp.stage FROM pay_periods pp
                   WHERE pp.organization_id = p_org AND pp.legal_entity_id = p_entity AND pp.pay_group_id IS NULL
                     AND p_on BETWEEN pp.period_start AND pp.period_end), 'open')
$$;

-- The step-4 guard now reads the lock service: locked and filed dates refuse attendance, leave days, fixes, OT, rosters
-- and swaps (the BEFORE triggers on those tables are unchanged and keep calling this function).
CREATE OR REPLACE FUNCTION yx_time_locked(p_org UUID, p_employee UUID, p_on DATE) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM employee_assignments a
    WHERE a.organization_id = p_org AND a.employee_id = p_employee AND a.superseded_at IS NULL
      AND p_on <@ daterange(a.valid_from, a.valid_to, '[]')
      AND pay_period_stage(p_org, a.legal_entity_id, p_on) IN ('locked', 'filed'))
$$;

-- Every stage change, kept for good (lock, reopen, file).
CREATE TABLE "period_lock_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "from_stage" VARCHAR(8) NOT NULL,
    "to_stage" VARCHAR(8) NOT NULL,
    "by_user" UUID,
    "reason" VARCHAR(500),
    "reopen_request_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_lock_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "period_lock_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "period_lock_events_period_fkey" FOREIGN KEY ("organization_id", "pay_period_id") REFERENCES "pay_periods"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "period_lock_events_stage_check" CHECK ("from_stage" IN ('open', 'frozen', 'locked', 'filed') AND "to_stage" IN ('open', 'frozen', 'locked', 'filed') AND "from_stage" <> "to_stage")
);
CREATE INDEX "period_lock_events_period_idx" ON "period_lock_events" ("organization_id", "pay_period_id", "created_at");
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "period_lock_events" FROM app_runtime;
-- The step-4 locks carried over: their lock (and, for an unlocked month, the unlock) as the first history rows.
SET LOCAL app.is_super_admin = 'on';
INSERT INTO "period_lock_events" ("organization_id", "pay_period_id", "from_stage", "to_stage", "by_user", "reason", "created_at")
SELECT "organization_id", "id", CASE WHEN "stage" = 'locked' THEN 'open' ELSE 'locked' END, "stage", "changed_by", "reason", "changed_at" FROM "pay_periods";

-- YX-LOCK-05: reopening is a high-risk request with two approvals through P03 (one waiting request per period).
CREATE TABLE "period_reopen_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "requested_by" UUID NOT NULL,
    "confirmation" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "period_reopen_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "period_reopen_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "period_reopen_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "period_reopen_requests_period_fkey" FOREIGN KEY ("organization_id", "pay_period_id") REFERENCES "pay_periods"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "period_reopen_requests_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "period_reopen_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "period_reopen_requests_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500)
);
CREATE UNIQUE INDEX "period_reopen_requests_one_pending" ON "period_reopen_requests" ("organization_id", "pay_period_id") WHERE "status" = 'pending';
REVOKE DELETE, TRUNCATE ON TABLE "period_reopen_requests" FROM app_runtime;
-- Only the status moves, once, from pending.
CREATE FUNCTION period_reopen_requests_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'pending'
     OR (to_jsonb(NEW) - 'status' - 'decided_at' - 'wf_request_id') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'wf_request_id')
     OR (OLD."wf_request_id" IS NOT NULL AND NEW."wf_request_id" IS DISTINCT FROM OLD."wf_request_id") THEN
    RAISE EXCEPTION 'A reopen request is only ever decided once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER period_reopen_requests_guard BEFORE UPDATE ON "period_reopen_requests" FOR EACH ROW EXECUTE FUNCTION period_reopen_requests_guard();

-- ---------------------------------------------------------------------------------------------
-- 3. Corrections into processed payroll and late device punches (PAY-1.03, PAY-1.04)

-- A late request (employee, within the company's maximum lateness, extra HR step), an HR correction, or a device
-- backfill row: never changes the locked period; approved, it waits for the next open payroll month (target_period).
CREATE TABLE "pay_corrections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "work_on" DATE NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "change" JSONB NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "wf_request_id" UUID,
    "backfill_id" UUID,
    "target_period" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_corrections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_corrections_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "pay_corrections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_corrections_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "pay_corrections_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "pay_corrections_period_fkey" FOREIGN KEY ("organization_id", "pay_period_id") REFERENCES "pay_periods"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "pay_corrections_kind_check" CHECK ("kind" IN ('attendance', 'leave', 'punches')),
    CONSTRAINT "pay_corrections_source_check" CHECK ("source" IN ('late_request', 'hr', 'device_backfill')),
    CONSTRAINT "pay_corrections_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'withdrawn')),
    CONSTRAINT "pay_corrections_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 5 AND 500)
);
CREATE INDEX "pay_corrections_target_idx" ON "pay_corrections" ("organization_id", "legal_entity_id", "target_period") WHERE "status" = 'approved';
REVOKE DELETE, TRUNCATE ON TABLE "pay_corrections" FROM app_runtime;
CREATE FUNCTION pay_corrections_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'pending'
     OR (to_jsonb(NEW) - 'status' - 'decided_at' - 'wf_request_id' - 'target_period') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'decided_at' - 'wf_request_id' - 'target_period') THEN
    RAISE EXCEPTION 'A correction is only ever decided once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pay_corrections_guard BEFORE UPDATE ON "pay_corrections" FOR EACH ROW EXECUTE FUNCTION pay_corrections_guard();

-- One audited HR action per late device batch (YX-LOCK-09).
CREATE TABLE "device_backfills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "device_ref" VARCHAR(100) NOT NULL,
    "from_on" DATE NOT NULL,
    "to_on" DATE NOT NULL,
    "punches" INTEGER NOT NULL,
    "people" INTEGER NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_backfills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_backfills_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "device_backfills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "device_backfills_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "device_backfills_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "device_backfills" FROM app_runtime;
ALTER TABLE "pay_corrections" ADD CONSTRAINT "pay_corrections_backfill_fkey" FOREIGN KEY ("organization_id", "backfill_id") REFERENCES "device_backfills"("organization_id", "id");

-- Punches of a late device batch for frozen / locked dates: held, never applied to the locked month.
CREATE TABLE "held_punches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "punched_at" TIMESTAMPTZ(3) NOT NULL,
    "work_on" DATE NOT NULL,
    "kind" VARCHAR(3) NOT NULL,
    "device_ref" VARCHAR(100) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'held',
    "backfill_id" UUID,
    "received_by" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "held_punches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "held_punches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "held_punches_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "held_punches_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "held_punches_backfill_fkey" FOREIGN KEY ("organization_id", "backfill_id") REFERENCES "device_backfills"("organization_id", "id"),
    CONSTRAINT "held_punches_kind_check" CHECK ("kind" IN ('in', 'out')),
    CONSTRAINT "held_punches_status_check" CHECK ("status" IN ('held', 'backfilled')),
    CONSTRAINT "held_punches_key" UNIQUE ("organization_id", "employee_id", "punched_at", "kind")
);
CREATE INDEX "held_punches_open_idx" ON "held_punches" ("organization_id", "legal_entity_id", "device_ref") WHERE "status" = 'held';
REVOKE DELETE, TRUNCATE ON TABLE "held_punches" FROM app_runtime;
CREATE FUNCTION held_punches_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'held' OR NEW."status" <> 'backfilled' OR NEW."backfill_id" IS NULL
     OR (to_jsonb(NEW) - 'status' - 'backfill_id') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'backfill_id') THEN
    RAISE EXCEPTION 'A held punch is only ever backfilled once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER held_punches_guard BEFORE UPDATE ON "held_punches" FOR EACH ROW EXECUTE FUNCTION held_punches_guard();

-- ---------------------------------------------------------------------------------------------
-- 4. Audit hash chain (PAY-1.05, YX-AUD-02/03)
--
-- One chain per company (chain_key = the company at insert; a fixed zero id for platform rows, which survives the
-- company's row being removed). row_hash = sha256 of the previous hash and the row's fields joined by U+001F, in the
-- order audit-chain.ts verifies. actor_user_id is left out on purpose: it is the one column the database itself may
-- change (ON DELETE SET NULL); the actor's snapshot (email, name, role) is in.

ALTER TABLE "audit_logs" ADD COLUMN "chain_key" UUID, ADD COLUMN "chain_seq" BIGINT, ADD COLUMN "prev_hash" CHAR(64), ADD COLUMN "row_hash" CHAR(64);

CREATE FUNCTION audit_row_hash(p_prev TEXT, p_seq BIGINT, p_chain UUID, p_id UUID, p_email TEXT, p_name TEXT, p_role TEXT, p_action TEXT, p_type TEXT, p_entity TEXT, p_meta TEXT, p_at TIMESTAMPTZ)
RETURNS CHAR(64) LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT encode(sha256(convert_to(concat_ws(chr(31), p_prev, p_seq::text, p_chain::text, p_id::text, coalesce(p_email, ''), coalesce(p_name, ''),
    coalesce(p_role, ''), p_action, p_type, coalesce(p_entity, ''), coalesce(p_meta, ''), floor(extract(epoch FROM p_at) * 1000)::bigint::text), 'UTF8')), 'hex')
$$;

-- Existing rows, chained per company in a fixed order (created_at, id), so every database gets the same chain.
DO $$
DECLARE
  r record;
  prev CHAR(64);
  seq BIGINT;
  cur UUID;
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);
  cur := NULL;
  FOR r IN SELECT a.* , coalesce(a.organization_id, '00000000-0000-0000-0000-000000000000'::uuid) AS ck FROM audit_logs a ORDER BY ck, a.created_at, a.id LOOP
    IF cur IS DISTINCT FROM r.ck THEN
      cur := r.ck; seq := 0; prev := repeat('0', 64);
    END IF;
    seq := seq + 1;
    UPDATE audit_logs SET chain_key = r.ck, chain_seq = seq, prev_hash = prev,
      row_hash = audit_row_hash(prev, seq, r.ck, r.id, r.actor_email, r.actor_name, r.actor_role, r.action, r.entity_type, r.entity_id, r.metadata_json, r.created_at)
    WHERE id = r.id
    RETURNING row_hash INTO prev;
  END LOOP;
END $$;

ALTER TABLE "audit_logs" ALTER COLUMN "chain_key" SET NOT NULL, ALTER COLUMN "chain_seq" SET NOT NULL, ALTER COLUMN "prev_hash" SET NOT NULL, ALTER COLUMN "row_hash" SET NOT NULL;
CREATE UNIQUE INDEX "audit_logs_chain_idx" ON "audit_logs" ("chain_key", "chain_seq");

-- Each new row links to its company's last one. The advisory lock orders writers of one company (held to commit),
-- so the chain is a single line with no gaps; other companies are not held up.
CREATE FUNCTION audit_chain_link() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_seq BIGINT;
  last_hash CHAR(64);
BEGIN
  NEW.chain_key := coalesce(NEW.organization_id, '00000000-0000-0000-0000-000000000000'::uuid);
  PERFORM pg_advisory_xact_lock(hashtextextended('yx_audit_chain:' || NEW.chain_key::text, 0));
  SELECT a.chain_seq, a.row_hash INTO last_seq, last_hash FROM audit_logs a WHERE a.chain_key = NEW.chain_key ORDER BY a.chain_seq DESC LIMIT 1;
  IF last_seq IS NULL THEN
    -- Everything before was archived (or this is the first row): continue from the newest archive.
    SELECT x.to_seq, x.last_hash INTO last_seq, last_hash FROM audit_archives x WHERE x.chain_key = NEW.chain_key ORDER BY x.to_seq DESC LIMIT 1;
  END IF;
  NEW.chain_seq := coalesce(last_seq, 0) + 1;
  NEW.prev_hash := coalesce(last_hash, repeat('0', 64));
  NEW.row_hash := audit_row_hash(NEW.prev_hash, NEW.chain_seq, NEW.chain_key, NEW.id, NEW.actor_email, NEW.actor_name, NEW.actor_role, NEW.action, NEW.entity_type, NEW.entity_id, NEW.metadata_json, NEW.created_at);
  RETURN NEW;
END $$;

-- Append-only for everyone (YX-AUD-02): the app role already has INSERT and SELECT only; this also stops the owner.
-- The database's own clean-ups stay possible: a removed user or company only clears its link (ON DELETE SET NULL), and
-- the archive job deletes rows already copied to an archive, through audit_archive_rows() below.
CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.audit_archive', true) IS NOT DISTINCT FROM 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'YX_AUDIT_APPEND_ONLY: audit rows are never deleted';
  END IF;
  IF (to_jsonb(NEW) - 'actor_user_id' - 'organization_id') IS DISTINCT FROM (to_jsonb(OLD) - 'actor_user_id' - 'organization_id')
     OR (NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id AND NEW.actor_user_id IS NOT NULL)
     OR (NEW.organization_id IS DISTINCT FROM OLD.organization_id AND NEW.organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'YX_AUDIT_APPEND_ONLY: audit rows never change';
  END IF;
  RETURN NEW;
END $$;

-- Daily verification results (YX-AUD-03): the chain's last row seen and whether every link held.
CREATE TABLE "audit_anchors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "chain_key" UUID NOT NULL,
    "last_seq" BIGINT NOT NULL,
    "last_hash" CHAR(64) NOT NULL,
    "rows_checked" BIGINT NOT NULL,
    "result" VARCHAR(8) NOT NULL,
    "broken_at_seq" BIGINT,
    "problem" VARCHAR(500),
    "verified_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_anchors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_anchors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_anchors_result_check" CHECK ("result" IN ('ok', 'broken'))
);
CREATE INDEX "audit_anchors_chain_idx" ON "audit_anchors" ("chain_key", "verified_at" DESC);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_anchors" FROM app_runtime;

-- Legal holds (YX-AUD-08, M08 Q7): audit of the window (and, when an employee is named, their pay documents) is never
-- archived or deleted while the hold stands.
CREATE TABLE "audit_legal_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "case_ref" VARCHAR(100) NOT NULL,
    "employee_id" UUID,
    "from_at" TIMESTAMPTZ(3) NOT NULL,
    "to_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "set_by" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "audit_legal_holds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_legal_holds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "audit_legal_holds_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "audit_legal_holds_window_check" CHECK ("from_at" <= "to_at"),
    CONSTRAINT "audit_legal_holds_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500)
);
REVOKE DELETE, TRUNCATE ON TABLE "audit_legal_holds" FROM app_runtime;
CREATE FUNCTION audit_legal_holds_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."released_at" IS NOT NULL OR NEW."released_at" IS NULL OR NEW."released_by" IS NULL
     OR (to_jsonb(NEW) - 'released_at' - 'released_by') IS DISTINCT FROM (to_jsonb(OLD) - 'released_at' - 'released_by') THEN
    RAISE EXCEPTION 'A legal hold is only ever released once';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_legal_holds_guard BEFORE UPDATE ON "audit_legal_holds" FOR EACH ROW EXECUTE FUNCTION audit_legal_holds_guard();

-- Archived ranges of a chain (rows older than 13 months, copied to an encrypted file with its hash). The chain carries
-- on from last_hash. deleted_at: the file was removed after the retention period (a deletion record is audited).
CREATE TABLE "audit_archives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "chain_key" UUID NOT NULL,
    "from_seq" BIGINT NOT NULL,
    "to_seq" BIGINT NOT NULL,
    "last_hash" CHAR(64) NOT NULL,
    "rows" INTEGER NOT NULL,
    "newest_at" TIMESTAMPTZ(3) NOT NULL,
    "file_ref" VARCHAR(500),
    "sha256" CHAR(64) NOT NULL,
    "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "audit_archives_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_archives_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_archives_range_check" CHECK ("from_seq" <= "to_seq"),
    CONSTRAINT "audit_archives_key" UNIQUE ("chain_key", "to_seq")
);
REVOKE DELETE, TRUNCATE ON TABLE "audit_archives" FROM app_runtime;
CREATE FUNCTION audit_archives_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A removed company only clears its link (ON DELETE SET NULL); the chain key stays.
  IF NEW."organization_id" IS NULL AND OLD."organization_id" IS NOT NULL AND (to_jsonb(NEW) - 'organization_id') = (to_jsonb(OLD) - 'organization_id') THEN
    RETURN NEW;
  END IF;
  IF OLD."deleted_at" IS NOT NULL OR NEW."deleted_at" IS NULL OR NEW."file_ref" IS NOT NULL
     OR (to_jsonb(NEW) - 'deleted_at' - 'file_ref') IS DISTINCT FROM (to_jsonb(OLD) - 'deleted_at' - 'file_ref') THEN
    RAISE EXCEPTION 'An audit archive only ever loses its file once, after the retention period';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_archives_guard BEFORE UPDATE ON "audit_archives" FOR EACH ROW EXECUTE FUNCTION audit_archives_guard();

/**
 * Removes a chain's rows up to p_upto once they are in an archive whose last hash matches the row there, all older than
 * 13 months and none inside a legal hold. The only way rows leave audit_logs. Returns the rows removed.
 */
CREATE FUNCTION audit_archive_rows(p_chain UUID, p_upto BIGINT) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n BIGINT;
  was_super TEXT := coalesce(current_setting('app.is_super_admin', true), 'off');
BEGIN
  PERFORM set_config('app.is_super_admin', 'on', true);
  IF NOT EXISTS (
    SELECT 1 FROM audit_archives x JOIN audit_logs a ON a.chain_key = x.chain_key AND a.chain_seq = x.to_seq AND a.row_hash = x.last_hash
    WHERE x.chain_key = p_chain AND x.to_seq = p_upto) THEN
    RAISE EXCEPTION 'No matching archive for these audit rows';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_logs a WHERE a.chain_key = p_chain AND a.chain_seq <= p_upto AND a.created_at >= now() - interval '13 months') THEN
    RAISE EXCEPTION 'Audit rows of the last 13 months stay online';
  END IF;
  IF EXISTS (
    SELECT 1 FROM audit_logs a JOIN audit_legal_holds h ON h.organization_id = a.chain_key AND h.released_at IS NULL AND a.created_at BETWEEN h.from_at AND h.to_at
    WHERE a.chain_key = p_chain AND a.chain_seq <= p_upto) THEN
    RAISE EXCEPTION 'Audit rows under a legal hold are kept';
  END IF;
  PERFORM set_config('app.audit_archive', 'on', true);
  DELETE FROM audit_logs a WHERE a.chain_key = p_chain AND a.chain_seq <= p_upto;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.audit_archive', 'off', true);
  PERFORM set_config('app.is_super_admin', was_super, true);
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION audit_archive_rows(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit_archive_rows(UUID, BIGINT) TO app_runtime;

CREATE TRIGGER audit_logs_chain BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_chain_link();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- ---------------------------------------------------------------------------------------------
-- 5. Exchange files (PAY-1.11, YX-INT-03)

CREATE TABLE "exchange_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "owner_type" VARCHAR(20) NOT NULL,
    "owner_id" UUID,
    "period_start" DATE,
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "file_ref" VARCHAR(500) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "row_count" INTEGER NOT NULL,
    "totals" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(16) NOT NULL DEFAULT 'generated',
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "release_wf_request_id" UUID,
    "released_by" UUID,
    "released_at" TIMESTAMPTZ(3),
    "superseded_by" UUID,

    CONSTRAINT "exchange_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exchange_files_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "exchange_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exchange_files_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "exchange_files_kind_check" CHECK ("kind" IN ('bank', 'ecr', 'esi', 'pt', 'lwf', 'form138', 'form140', 'journal', 'register', 'wps')),
    CONSTRAINT "exchange_files_status_check" CHECK ("status" IN ('generated', 'release_pending', 'released', 'superseded')),
    CONSTRAINT "exchange_files_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "exchange_files_period_idx" ON "exchange_files" ("organization_id", "legal_entity_id", "period_start");
REVOKE DELETE, TRUNCATE ON TABLE "exchange_files" FROM app_runtime;
-- The bytes, hash, rows and totals never change; status moves forward only; the release is recorded once.
CREATE FUNCTION exchange_files_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'status' - 'release_wf_request_id' - 'released_by' - 'released_at' - 'superseded_by')
       IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'release_wf_request_id' - 'released_by' - 'released_at' - 'superseded_by')
     OR OLD."status" IN ('released', 'superseded') AND NEW."status" <> 'superseded'
     OR (OLD."released_at" IS NOT NULL AND (NEW."released_at", NEW."released_by") IS DISTINCT FROM (OLD."released_at", OLD."released_by"))
     OR (NEW."status" = 'released' AND (NEW."released_by" IS NULL OR NEW."released_by" = NEW."generated_by")) THEN
    RAISE EXCEPTION 'An exchange file never changes; it is released once, by someone other than its maker';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER exchange_files_guard BEFORE UPDATE ON "exchange_files" FOR EACH ROW EXECUTE FUNCTION exchange_files_guard();

-- Single-use download links (60 seconds), kept for the audit of who fetched what.
CREATE TABLE "exchange_file_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_file_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exchange_file_links_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "exchange_file_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exchange_file_links_file_fkey" FOREIGN KEY ("organization_id", "file_id") REFERENCES "exchange_files"("organization_id", "id") ON DELETE CASCADE
);
REVOKE DELETE, TRUNCATE ON TABLE "exchange_file_links" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 6. Pay documents (PAY-1.09, PAY-1.10; P05 YX-DOC-07…19)

CREATE TABLE "pay_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "period_start" DATE,
    "template_key" VARCHAR(40) NOT NULL,
    "template_version" INTEGER NOT NULL,
    "reference_no" VARCHAR(60) NOT NULL,
    "file_ref" VARCHAR(500),
    "sha256" CHAR(64) NOT NULL,
    "verify_code" VARCHAR(16),
    "status" VARCHAR(20) NOT NULL,
    "supersedes_id" UUID,
    "superseded_by_id" UUID,
    "signature" VARCHAR(20) NOT NULL DEFAULT 'none',
    "signature_ref" VARCHAR(200),
    "signed_at" TIMESTAMPTZ(3),
    "issued_by" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retain_until" DATE NOT NULL,
    "purged_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_documents_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "pay_documents_ref_key" UNIQUE ("organization_id", "legal_entity_id", "kind", "reference_no"),
    CONSTRAINT "pay_documents_verify_key" UNIQUE ("verify_code"),
    CONSTRAINT "pay_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_documents_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "pay_documents_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "pay_documents_supersedes_fkey" FOREIGN KEY ("organization_id", "supersedes_id") REFERENCES "pay_documents"("organization_id", "id"),
    CONSTRAINT "pay_documents_kind_check" CHECK ("kind" IN ('payslip', 'form130', 'form131', 'revision_letter', 'payment_advice', 'register', 'inspection_pack', 'correction_statement')),
    CONSTRAINT "pay_documents_status_check" CHECK ("status" IN ('awaiting_signature', 'issued', 'superseded')),
    CONSTRAINT "pay_documents_signature_check" CHECK ("signature" IN ('none', 'awaiting', 'signed')),
    CONSTRAINT "pay_documents_sha_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "pay_documents_employee_idx" ON "pay_documents" ("organization_id", "employee_id", "issued_at" DESC);
REVOKE DELETE, TRUNCATE ON TABLE "pay_documents" FROM app_runtime;
-- YX-DOC-09: an issued document never changes. Allowed moves: a signed file replaces the unsigned one before issue
-- (awaiting_signature → issued, once); issued → superseded (once, naming its successor); the file is purged after the
-- retention date (YX-DOC-13) with nothing else touched.
CREATE FUNCTION pay_documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  fixed TEXT[] := ARRAY['status', 'superseded_by_id', 'file_ref', 'sha256', 'verify_code', 'signature', 'signature_ref', 'signed_at', 'purged_at'];
BEGIN
  IF (to_jsonb(NEW) - fixed) IS DISTINCT FROM (to_jsonb(OLD) - fixed) THEN
    RAISE EXCEPTION 'YX_DOC_IMMUTABLE: an issued pay document never changes';
  END IF;
  IF OLD."status" = 'awaiting_signature' AND NEW."status" = 'issued' AND NEW."signature" = 'signed' AND NEW."signed_at" IS NOT NULL AND OLD."purged_at" IS NULL AND NEW."purged_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'issued' AND NEW."status" = 'superseded' AND NEW."superseded_by_id" IS NOT NULL
     AND (to_jsonb(NEW) - 'status' - 'superseded_by_id') = (to_jsonb(OLD) - 'status' - 'superseded_by_id') THEN
    RETURN NEW;
  END IF;
  IF OLD."purged_at" IS NULL AND NEW."purged_at" IS NOT NULL AND NEW."file_ref" IS NULL AND OLD."retain_until" < CURRENT_DATE
     AND (to_jsonb(NEW) - 'purged_at' - 'file_ref') = (to_jsonb(OLD) - 'purged_at' - 'file_ref') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'YX_DOC_IMMUTABLE: an issued pay document never changes';
END $$;
CREATE TRIGGER pay_documents_guard BEFORE UPDATE ON "pay_documents" FOR EACH ROW EXECUTE FUNCTION pay_documents_guard();

-- YX-DOC-09: reference numbers without gaps per legal entity and kind (the counter row is locked by the issuing
-- transaction; a rolled-back issue gives its number back).
CREATE TABLE "pay_document_counters" (
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "year" SMALLINT NOT NULL,
    "last_no" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pay_document_counters_pkey" PRIMARY KEY ("organization_id", "legal_entity_id", "kind", "year"),
    CONSTRAINT "pay_document_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_document_counters_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_document_counters" FROM app_runtime;

-- YX-DOC-19: nominees of a person who died in service, released by HR (read-only, OTP, audited).
CREATE TABLE "pay_document_nominees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "email_enc" TEXT NOT NULL,
    "email_last4" VARCHAR(8) NOT NULL,
    "valid_until" DATE NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_by" UUID,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_document_nominees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_document_nominees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_document_nominees_entity_fkey" FOREIGN KEY ("organization_id", "legal_entity_id") REFERENCES "legal_entities"("organization_id", "id"),
    CONSTRAINT "pay_document_nominees_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);
CREATE INDEX "pay_document_nominees_email_idx" ON "pay_document_nominees" ("email_hash") WHERE "revoked_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "pay_document_nominees" FROM app_runtime;

-- Alumni and nominee sessions (an OTP sign-in, not a users row): 30 minutes, ended on sign-out.
CREATE TABLE "pay_portal_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "nominee_id" UUID,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pay_portal_sessions_token_key" UNIQUE ("token_hash"),
    CONSTRAINT "pay_portal_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "pay_portal_sessions_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id")
);
REVOKE DELETE, TRUNCATE ON TABLE "pay_portal_sessions" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- 7. Tenant isolation, support sessions, the pay guard

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['period_lock_events', 'period_reopen_requests', 'pay_corrections', 'device_backfills', 'held_punches', 'audit_anchors', 'audit_legal_holds', 'audit_archives', 'exchange_files', 'exchange_file_links', 'pay_documents', 'pay_document_counters', 'pay_document_nominees', 'pay_portal_sessions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
  -- P02 Q8: YukthiX support never sees payroll, even in an approved support session.
  FOREACH t IN ARRAY ARRAY['pay_periods', 'period_lock_events', 'period_reopen_requests', 'pay_corrections', 'device_backfills', 'held_punches', 'payroll_feed_rows', 'exchange_files', 'exchange_file_links', 'pay_documents', 'pay_document_counters', 'pay_document_nominees', 'pay_portal_sessions']
  LOOP
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;

-- §5.1 pay guard: one person's pay is read by that person, or by payroll staff of its legal entity; written only by
-- payroll staff. No super-admin escape. An alumni / nominee session reads only its one employee's documents.
CREATE POLICY pay_guard ON "pay_documents" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = (SELECT app_pay_portal_employee()))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
-- Entity-level pay files (bank, statutory, journals): payroll staff of the entity only.
CREATE POLICY pay_guard ON "exchange_files" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
CREATE POLICY pay_guard ON "exchange_file_links" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
CREATE POLICY pay_guard ON "pay_document_counters" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
CREATE POLICY pay_guard ON "pay_document_nominees" AS RESTRICTIVE
  USING ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]) OR "employee_id" = (SELECT app_pay_portal_employee()))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));

-- ---------------------------------------------------------------------------------------------
-- 8. Permission keys (P02; also in prisma/seed.ts) and the 'payroll-write' API-key scope (P11 YX-API-12)

INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.period.view', 'See pay periods, their lock stage, history and corrections for the legal entities in scope'),
  (gen_random_uuid(), 'payroll.period.reopen', 'Ask to reopen a locked pay period, and check (first approval) a reopen someone else asked for (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.period.reopen.approve', 'Give the final approval to reopen a locked pay period (Finance or System Admin; needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.correction.approve', 'Approve corrections that reach a processed payroll month; they are paid in the next payroll'),
  (gen_random_uuid(), 'payroll.document.view', 'See and download the pay documents of the people in scope (every view of someone else''s document is recorded)'),
  (gen_random_uuid(), 'payroll.document.issue', 'Issue pay documents and supersede them with a correction (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'payroll.file.view', 'See and download payroll exchange files (bank, statutory, journal) of the legal entities in scope; every download is recorded'),
  (gen_random_uuid(), 'payroll.file.release', 'Release an exchange file someone else generated (needs a fresh second sign-in step)'),
  (gen_random_uuid(), 'audit.view', 'Read the audit log and record timelines in scope; Confidential values are masked without the field permission'),
  (gen_random_uuid(), 'audit.export', 'Export the audit log (every export is itself recorded)'),
  (gen_random_uuid(), 'audit.hold.manage', 'Place and release legal holds on audit entries and pay documents')
ON CONFLICT DO NOTHING;
-- The System Admin reads the full audit log, holds legal holds and gives the final reopen approval (P08 Q3 / Q8); no pay.
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('audit.view', 'audit.export', 'audit.hold.manage', 'payroll.period.reopen.approve')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'auditor', "id" FROM "permissions" WHERE "key" = 'audit.view'
ON CONFLICT DO NOTHING;

ALTER TABLE "organizations" ADD COLUMN "api_key_scopes" TEXT[] NOT NULL DEFAULT '{}';

-- P07 data (YX-DOC-22, YX-GLB-16): the wage-slip particulars a payslip must always show. Never in code; on the
-- compliance verify list like every legal figure.
ALTER TABLE "statutory_rule_sets" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "statutory_rule_sets" DISABLE ROW LEVEL SECURITY;
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source") VALUES
  ('IN.WAGESLIP', 'IN', '2025-v1', '2025-11-21',
   '{"mandatory":[{"key":"employerName","label":"Employer"},{"key":"employeeName","label":"Name"},{"key":"employeeCode","label":"Employee code"},{"key":"designation","label":"Designation"},{"key":"period","label":"Wage period"},{"key":"paidDays","label":"Days paid"},{"key":"earnings","label":"Wages earned"},{"key":"deductions","label":"Deductions"},{"key":"grossPay","label":"Gross wages"},{"key":"netPay","label":"Net wages paid"}]}',
   'Code on Wages, 2019 and the Code on Wages (Central) Rules (wage slip to every employee); Payment of Wages Act, 1936 and state rules for periods before the Code. Verify the particulars per state before go-live.');
ALTER TABLE "statutory_rule_sets" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- The public verify page (YX-DOC-11) opens exactly one document: the one whose code it was given.
CREATE FUNCTION app_pay_verify_code() RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.pay_verify_code', true), '')
$$;
DROP POLICY pay_guard ON "pay_documents";
CREATE POLICY pay_guard ON "pay_documents" AS RESTRICTIVE
  USING ("employee_id" = ANY ((SELECT app_current_employee_ids())::uuid[]) OR "legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[])
         OR "employee_id" = (SELECT app_pay_portal_employee()) OR "verify_code" = (SELECT app_pay_verify_code()))
  WITH CHECK ("legal_entity_id" = ANY ((SELECT app_pay_entities())::uuid[]));
