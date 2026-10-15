-- Recruitment batch AT4 (M10-BUILD-DESIGN §7, §13): duplicates and merge, talent pools and hotlists, legal hold and
-- the automatic retention sweep.

-- ------------------------------------------------------------------------------------------------ candidates
-- phone_e164: computed by the database from whatever was typed, so every create path (apply, walk-in, agency,
-- referral, bulk upload) gets it without code. India is the default country for a 10-digit number.
ALTER TABLE "candidates"
  ADD COLUMN "phone_e164" VARCHAR(20) GENERATED ALWAYS AS (
    CASE
      WHEN "phone" IS NULL THEN NULL
      WHEN regexp_replace("phone", '[^0-9+]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$' THEN regexp_replace("phone", '[^0-9+]', '', 'g')
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^[6-9][0-9]{9}$' THEN '+91' || regexp_replace("phone", '[^0-9]', '', 'g')
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^0[6-9][0-9]{9}$' THEN '+91' || substr(regexp_replace("phone", '[^0-9]', '', 'g'), 2)
      WHEN regexp_replace("phone", '[^0-9]', '', 'g') ~ '^91[6-9][0-9]{9}$' THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN "merged_into_id" UUID REFERENCES "candidates"("id"),
  ADD COLUMN "legal_hold_at" TIMESTAMPTZ(3),
  ADD COLUMN "legal_hold_reason" VARCHAR(500),
  ADD COLUMN "legal_hold_by" UUID,
  ADD COLUMN "retention_renewed_at" TIMESTAMPTZ(3),
  ADD COLUMN "retention_notice_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "candidates_not_merged_into_self" CHECK ("merged_into_id" IS NULL OR "merged_into_id" <> "id"),
  ADD CONSTRAINT "candidates_hold_has_reason" CHECK ("legal_hold_at" IS NULL OR "legal_hold_reason" IS NOT NULL);
CREATE INDEX "candidates_org_phone_e164_idx" ON "candidates" ("organization_id", "phone_e164") WHERE "phone_e164" IS NOT NULL;

-- ------------------------------------------------------------------------------------------------ merges (D10)
-- One row per merge: who merged which candidate into which, the value chosen for each field and what moved. A merge
-- is never undone, so the app can neither change nor remove these rows.
CREATE TABLE "candidate_merges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kept_id" UUID NOT NULL REFERENCES "candidates"("id"),
    "merged_id" UUID NOT NULL REFERENCES "candidates"("id"),
    "merged_by" UUID,
    "merged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "choices" JSONB NOT NULL,
    "moved" JSONB NOT NULL,
    CONSTRAINT "candidate_merges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "candidate_merges_two_people" CHECK ("kept_id" <> "merged_id")
);
CREATE UNIQUE INDEX "candidate_merges_merged_key" ON "candidate_merges" ("merged_id");
CREATE INDEX "candidate_merges_kept_idx" ON "candidate_merges" ("organization_id", "kept_id");

-- ------------------------------------------------------------------------------------------------ pools and hotlists
CREATE TABLE "talent_pools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "description" VARCHAR(500),
    "owner_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),
    CONSTRAINT "talent_pools_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "talent_pools_kind_check" CHECK ("kind" IN ('pool', 'hotlist'))
);
CREATE UNIQUE INDEX "talent_pools_org_name_key" ON "talent_pools" ("organization_id", lower("name"));

CREATE TABLE "talent_pool_members" (
    "organization_id" UUID NOT NULL,
    "pool_id" UUID NOT NULL REFERENCES "talent_pools"("id") ON DELETE CASCADE,
    "candidate_id" UUID NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
    "added_by" UUID,
    "added_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" VARCHAR(500),
    CONSTRAINT "talent_pool_members_pkey" PRIMARY KEY ("pool_id", "candidate_id")
);
CREATE INDEX "talent_pool_members_candidate_idx" ON "talent_pool_members" ("organization_id", "candidate_id");

-- ------------------------------------------------------------------------------------------------ retention log
-- What each sweep did. No personal data: counts, and the candidate id of each change (the row itself is anonymised).
CREATE TABLE "candidate_retention_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_by" UUID,
    "period_months" INTEGER NOT NULL,
    "renewals_sent" INTEGER NOT NULL DEFAULT 0,
    "anonymised" INTEGER NOT NULL DEFAULT 0,
    "skipped_hold" INTEGER NOT NULL DEFAULT 0,
    "skipped_open" INTEGER NOT NULL DEFAULT 0,
    "skipped_hired" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "candidate_retention_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "candidate_retention_runs_org_idx" ON "candidate_retention_runs" ("organization_id", "run_at" DESC);

CREATE TABLE "candidate_retention_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "run_id" UUID NOT NULL REFERENCES "candidate_retention_runs"("id"),
    "candidate_id" UUID NOT NULL REFERENCES "candidates"("id"),
    "action" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "candidate_retention_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "candidate_retention_actions_action_check" CHECK ("action" IN ('renewal_sent', 'anonymised', 'skipped_hold', 'skipped_open', 'skipped_hired'))
);
CREATE INDEX "candidate_retention_actions_run_idx" ON "candidate_retention_actions" ("run_id");

-- ------------------------------------------------------------------------------------------------ RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['candidate_merges', 'talent_pools', 'talent_pool_members', 'candidate_retention_runs', 'candidate_retention_actions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;
-- Records: a merge and a retention log line are never changed or removed by the app.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "candidate_merges", "candidate_retention_actions" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "candidate_retention_runs" FROM app_runtime;
