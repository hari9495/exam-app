-- HLP-14 Write policies with AI (founder decisions 4 Nov 2026). A policy manager answers a short questionnaire; the
-- company's own AI (or a YukthiX starter when AI is off) writes the prose clauses; the rule lines come from the answers
-- and are checked against the dated law tables (statutory_rule_sets). Any law finding blocks approval. One policy
-- manager approves: the text becomes a policy version waiting in the HLP-10/11 library, and a SECOND person publishes it.
-- Rules: docs/yukthix/helpdesk-design-map.md section 4i.

CREATE TABLE "policy_ai_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "policy_type" VARCHAR(20) NOT NULL,
    -- Only what the questionnaire asked (no names, no personal data); validated by the API before it is stored.
    "answers" JSONB NOT NULL,
    -- The numbers the rule lines state (from the answers; "Use the legal minimum" raises them).
    "values" JSONB NOT NULL,
    -- The prose clauses as plain text (AI output is cleaned to plain text before it is stored).
    "clauses" JSONB NOT NULL,
    "mode" VARCHAR(10) NOT NULL,
    "provider" VARCHAR(40),
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "policy_id" UUID,
    "policy_version_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_ai_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "policy_ai_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "policy_ai_drafts_policy_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy_documents"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_ai_drafts_version_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE CASCADE,
    CONSTRAINT "policy_ai_drafts_type_check" CHECK ("policy_type" IN ('leave', 'work_from_home', 'notice')),
    CONSTRAINT "policy_ai_drafts_mode_check" CHECK ("mode" IN ('ai', 'starter')),
    CONSTRAINT "policy_ai_drafts_status_check" CHECK ("status" IN ('draft', 'approved')),
    CONSTRAINT "policy_ai_drafts_approved_check" CHECK ("status" <> 'approved' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL AND "policy_id" IS NOT NULL AND "policy_version_id" IS NOT NULL))
);
CREATE INDEX "policy_ai_drafts_org_idx" ON "policy_ai_drafts" ("organization_id", "status", "created_at");

-- An approved draft never changes.
CREATE OR REPLACE FUNCTION policy_ai_drafts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'approved' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'an approved policy draft never changes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER policy_ai_drafts_guard BEFORE UPDATE ON "policy_ai_drafts" FOR EACH ROW EXECUTE FUNCTION policy_ai_drafts_guard();

-- The version an approved draft became remembers its approver: it always needs a second person, and the approver can
-- never publish it, whoever edits it later (founder decision 3, enforced here as well as in the API).
ALTER TABLE "policy_versions"
  ADD COLUMN "ai_approved_by" UUID,
  ADD CONSTRAINT "policy_versions_ai_approver_check" CHECK ("ai_approved_by" IS NULL OR ("needs_second_person" AND ("published_by" IS NULL OR "published_by" <> "ai_approved_by")));

REVOKE DELETE, TRUNCATE ON TABLE "policy_ai_drafts" FROM app_runtime;

ALTER TABLE "policy_ai_drafts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "policy_ai_drafts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
