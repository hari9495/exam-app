-- Performance batch PM3 (M06-BUILD-DESIGN §5.4, §8, §15.3; PM-3.01 … 3.03): anytime feedback and requests for it, 1:1s
-- with a shared agenda, shared notes, private notes per author and action items, and HR sealing of a feedback item that
-- reports a concern (it leaves every performance view; the text stays only for the confidential channel).
-- Forced RLS + tenant_isolation; support sessions never read any of it (§5.10). Nothing is erased: feedback is withdrawn
-- or sealed; private notes are kept.

CREATE TABLE "feedback_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "requested_by_employee_id" UUID NOT NULL,
    "about_employee_id" UUID NOT NULL,
    "asked_employee_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "due_on" DATE,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(3),
    CONSTRAINT "feedback_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedback_requests_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "feedback_requests_by_fkey" FOREIGN KEY ("organization_id", "requested_by_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "feedback_requests_about_fkey" FOREIGN KEY ("organization_id", "about_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "feedback_requests_asked_fkey" FOREIGN KEY ("organization_id", "asked_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "feedback_requests_status_check" CHECK ("status" IN ('open', 'answered', 'declined')),
    CONSTRAINT "feedback_requests_self_check" CHECK ("asked_employee_id" <> "about_employee_id")
);
CREATE INDEX "feedback_requests_asked_idx" ON "feedback_requests" ("organization_id", "asked_employee_id", "status");

CREATE TABLE "feedback_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "from_employee_id" UUID NOT NULL,
    "to_employee_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "visibility" VARCHAR(14) NOT NULL DEFAULT 'private',
    "goal_id" UUID,
    "request_id" UUID,
    "withdrawn_at" TIMESTAMPTZ(3),
    "sealed_at" TIMESTAMPTZ(3),
    "sealed_by" UUID,
    "seal_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "feedback_items_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "feedback_items_from_fkey" FOREIGN KEY ("organization_id", "from_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "feedback_items_to_fkey" FOREIGN KEY ("organization_id", "to_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "feedback_items_goal_fkey" FOREIGN KEY ("organization_id", "goal_id") REFERENCES "goals"("organization_id", "id"),
    CONSTRAINT "feedback_items_request_fkey" FOREIGN KEY ("organization_id", "request_id") REFERENCES "feedback_requests"("organization_id", "id"),
    CONSTRAINT "feedback_items_kind_check" CHECK ("kind" IN ('praise', 'suggestion')),
    CONSTRAINT "feedback_items_visibility_check" CHECK ("visibility" IN ('private', 'recipient_only')),
    CONSTRAINT "feedback_items_self_check" CHECK ("from_employee_id" <> "to_employee_id"),
    CONSTRAINT "feedback_items_seal_check" CHECK (("sealed_at" IS NULL) = ("seal_reason" IS NULL))
);
CREATE INDEX "feedback_items_to_idx" ON "feedback_items" ("organization_id", "to_employee_id", "created_at" DESC);
CREATE INDEX "feedback_items_from_idx" ON "feedback_items" ("organization_id", "from_employee_id", "created_at" DESC);

CREATE TABLE "one_on_ones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "manager_employee_id" UUID NOT NULL,
    "on" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'planned',
    "shared_notes" VARCHAR(10000),
    "reminded_on" DATE,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "one_on_ones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "one_on_ones_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "one_on_ones_employee_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "one_on_ones_manager_fkey" FOREIGN KEY ("organization_id", "manager_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "one_on_ones_status_check" CHECK ("status" IN ('planned', 'held', 'cancelled')),
    CONSTRAINT "one_on_ones_pair_check" CHECK ("employee_id" <> "manager_employee_id")
);
CREATE INDEX "one_on_ones_pair_idx" ON "one_on_ones" ("organization_id", "employee_id", "manager_employee_id", "on" DESC);

CREATE TABLE "one_on_one_agenda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "one_on_one_id" UUID NOT NULL,
    "added_by_employee_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "one_on_one_agenda_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "one_on_one_agenda_fkey" FOREIGN KEY ("organization_id", "one_on_one_id") REFERENCES "one_on_ones"("organization_id", "id")
);

CREATE TABLE "one_on_one_private_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "one_on_one_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "text" VARCHAR(10000) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "one_on_one_private_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "one_on_one_private_notes_key" UNIQUE ("one_on_one_id", "author_user_id"),
    CONSTRAINT "one_on_one_private_notes_fkey" FOREIGN KEY ("organization_id", "one_on_one_id") REFERENCES "one_on_ones"("organization_id", "id")
);

CREATE TABLE "one_on_one_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "one_on_one_id" UUID NOT NULL,
    "owner_employee_id" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "due_on" DATE,
    "goal_id" UUID,
    "done_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "one_on_one_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "one_on_one_actions_fkey" FOREIGN KEY ("organization_id", "one_on_one_id") REFERENCES "one_on_ones"("organization_id", "id"),
    CONSTRAINT "one_on_one_actions_owner_fkey" FOREIGN KEY ("organization_id", "owner_employee_id") REFERENCES "employees"("organization_id", "id"),
    CONSTRAINT "one_on_one_actions_goal_fkey" FOREIGN KEY ("organization_id", "goal_id") REFERENCES "goals"("organization_id", "id")
);

-- ---------------------------------------------------------------------------------------------- RLS (§5.10)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['feedback_requests', 'feedback_items', 'one_on_ones', 'one_on_one_agenda', 'one_on_one_private_notes', 'one_on_one_actions']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format(
      'CREATE POLICY support_session_excluded ON %I AS RESTRICTIVE
         USING ((SELECT app_support_session()) IS NULL)
         WITH CHECK ((SELECT app_support_session()) IS NULL)',
      t);
  END LOOP;
END $$;
REVOKE DELETE, TRUNCATE ON TABLE "feedback_requests" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "feedback_items" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "one_on_ones" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "one_on_one_private_notes" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------- permission key (§17)
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'perf.concern.seal', 'Seal a feedback item that reports a concern, so it leaves every performance view')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" = 'perf.concern.seal'
ON CONFLICT DO NOTHING;
