-- HIR-20 Talent CRM campaigns and sourced profiles, HIR-05 under-18 guardian consent (10 Nov 2026).
-- Campaigns: a sequence of steps (a message from the company's templates, or a wait) sent to the consenting members
-- of one talent pool by the 'crm-campaigns' sweep. Each step goes to a person once (unique member + step); every send
-- is a row here and an audit entry. Sourced profiles: a person found outside YukthiX, kept apart from candidates (not
-- searchable or contactable) until they consent; without consent they are erased after hiring.sourced.keep_days.
-- Under 18: the date of birth is sealed (Special data); a guardian consent row gates moves past screening and offers.

CREATE TABLE "talent_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "channel" VARCHAR(10) NOT NULL,
    "pool_id" UUID NOT NULL,
    -- [{"kind":"message","templateId":uuid} | {"kind":"wait","days":int}]
    "steps" JSONB NOT NULL DEFAULT '[]',
    "stop_on_reply" BOOLEAN NOT NULL DEFAULT true,
    "stop_on_apply" BOOLEAN NOT NULL DEFAULT true,
    -- draft | running | stopped | done
    "status" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    CONSTRAINT "talent_campaigns_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "talent_campaigns_channel_check" CHECK ("channel" IN ('email', 'whatsapp')),
    CONSTRAINT "talent_campaigns_status_check" CHECK ("status" IN ('draft', 'running', 'stopped', 'done')),
    CONSTRAINT "talent_campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "talent_campaigns_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "talent_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "talent_campaigns_org_idx" ON "talent_campaigns" ("organization_id", "created_at" DESC);

CREATE TABLE "talent_campaign_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL DEFAULT 0,
    "next_due_at" TIMESTAMPTZ(3) NOT NULL,
    -- active | done | stopped
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    -- replied | applied | opted_out | no_consent | hired | erased | campaign_stopped
    "stop_reason" VARCHAR(20),
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    CONSTRAINT "talent_campaign_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "talent_campaign_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "talent_campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "talent_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "talent_campaign_members_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "talent_campaign_members_campaign_candidate_key" ON "talent_campaign_members" ("campaign_id", "candidate_id");
CREATE INDEX "talent_campaign_members_due_idx" ON "talent_campaign_members" ("status", "next_due_at");
CREATE INDEX "talent_campaign_members_candidate_idx" ON "talent_campaign_members" ("organization_id", "candidate_id");

CREATE TABLE "talent_campaign_sends" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "channel" VARCHAR(10) NOT NULL,
    "template_id" UUID,
    -- sending (claimed, before the provider call) | sent | failed
    "status" VARCHAR(10) NOT NULL DEFAULT 'sending',
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "talent_campaign_sends_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "talent_campaign_sends_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "talent_campaign_sends_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "talent_campaign_members"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Each step goes to a person once, whatever retries or parallel sweeps do.
CREATE UNIQUE INDEX "talent_campaign_sends_member_step_key" ON "talent_campaign_sends" ("member_id", "step_index");
CREATE INDEX "talent_campaign_sends_org_day_idx" ON "talent_campaign_sends" ("organization_id", "sent_at");

CREATE TABLE "sourced_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "headline" VARCHAR(200),
    "site" VARCHAR(20) NOT NULL,
    -- The lawful source: where the details were found and why contacting the person is allowed.
    "source_note" VARCHAR(500) NOT NULL,
    "consent_token" VARCHAR(64) NOT NULL,
    -- pending | given | declined
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "asked_at" TIMESTAMPTZ(3),
    "answered_at" TIMESTAMPTZ(3),
    "purge_after" TIMESTAMPTZ(3) NOT NULL,
    "candidate_id" UUID,
    "captured_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sourced_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sourced_profiles_status_check" CHECK ("status" IN ('pending', 'given', 'declined')),
    CONSTRAINT "sourced_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sourced_profiles_consent_token_key" ON "sourced_profiles" ("consent_token");
CREATE UNIQUE INDEX "sourced_profiles_org_email_pending_key" ON "sourced_profiles" ("organization_id", lower("email")) WHERE "status" = 'pending';
CREATE INDEX "sourced_profiles_purge_idx" ON "sourced_profiles" ("status", "purge_after");

-- Under 18 (HIR-05): the date of birth sealed with the company key (Special data), never in plain text.
ALTER TABLE "candidates" ADD COLUMN "dob_sealed" TEXT;
-- WhatsApp only where the candidate opted in (HIR-20); set from the candidate's own choice, never by a recruiter.
ALTER TABLE "candidates" ADD COLUMN "whatsapp_opted_in_at" TIMESTAMPTZ(3);

CREATE TABLE "guardian_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "guardian_name" VARCHAR(200) NOT NULL,
    "guardian_email" VARCHAR(320) NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    -- pending | given | declined
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "asked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMPTZ(3),
    "asked_by" UUID,
    CONSTRAINT "guardian_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardian_consents_status_check" CHECK ("status" IN ('pending', 'given', 'declined')),
    CONSTRAINT "guardian_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "guardian_consents_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "guardian_consents_token_key" ON "guardian_consents" ("token");
CREATE INDEX "guardian_consents_candidate_idx" ON "guardian_consents" ("organization_id", "candidate_id", "asked_at" DESC);

ALTER TABLE "talent_campaigns" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "talent_campaign_members" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "talent_campaign_sends" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "sourced_profiles" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
ALTER TABLE "guardian_consents" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "talent_campaigns" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY tenant_isolation ON "talent_campaign_members" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY tenant_isolation ON "talent_campaign_sends" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY tenant_isolation ON "sourced_profiles" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY tenant_isolation ON "guardian_consents" USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin())) WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));

-- A send is a record of what went out: only its status moves on (sending -> sent | failed).
CREATE FUNCTION talent_campaign_sends_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.member_id <> OLD.member_id OR NEW.step_index <> OLD.step_index OR NEW.candidate_id <> OLD.candidate_id OR OLD.status <> 'sending' THEN
    RAISE EXCEPTION 'campaign sends are append-only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER talent_campaign_sends_guard BEFORE UPDATE ON "talent_campaign_sends" FOR EACH ROW EXECUTE FUNCTION talent_campaign_sends_guard();

-- The age below which a candidate needs a guardian's consent, and what is held until then: data, marked verify until
-- counsel checks it (GO-LIVE-CHECKLIST: Child Labour Act and DPDP s.9).
SELECT set_config('app.is_super_admin', 'on', true);
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('HIR.MINOR', 'IN', '2023-v1', '2023-08-11',
   '{"name":"Under-18 candidates (DPDP Act 2023 s.9; Child and Adolescent Labour Act 1986)","minAge":18,"holdAfter":"screening","offerNeedsGuardian":true,"noAutomatedScoring":true}',
   'Digital Personal Data Protection Act 2023 s.2(f) and s.9 (a child is under 18; verifiable consent of a parent or lawful guardian; no tracking, behavioural monitoring or targeted advertising) and the Child and Adolescent Labour (Prohibition and Regulation) Act 1986 (no work under 14; 14 to 18 barred from hazardous occupations). Verify with counsel.', true)
ON CONFLICT DO NOTHING;
