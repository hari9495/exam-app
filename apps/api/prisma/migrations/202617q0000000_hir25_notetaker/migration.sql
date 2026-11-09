-- HIR-25 interview notetaker (founder decision 2), 13 Nov 2026. Consent from every participant comes first: one row per
-- participant (the candidate, each panellist) with their answer and who recorded it; no row = still waiting. A
-- transcript is kept only while everyone has consented (a later "no" deletes it and every draft), for the company's set
-- days, and goes with the candidate erase. An AI draft scorecard is the panellist's own suggestion until they submit.
-- New tables only; no data is written.
CREATE TABLE "interview_notetaker_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    -- 'candidate', or the panellist's user id.
    "participant" VARCHAR(40) NOT NULL,
    "consent" VARCHAR(10) NOT NULL,
    "recorded_by" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_notetaker_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interview_notetaker_consents_consent_check" CHECK ("consent" IN ('given', 'declined')),
    CONSTRAINT "interview_notetaker_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_notetaker_consents_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "interview_notetaker_consents_key" ON "interview_notetaker_consents" ("interview_id", "participant");

CREATE TABLE "interview_transcripts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    -- 'upload' (a panellist adds it) until a recording provider is connected.
    "source" VARCHAR(12) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_transcripts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interview_transcripts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_transcripts_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "interview_transcripts_interview_key" ON "interview_transcripts" ("interview_id");
CREATE INDEX "interview_transcripts_age_idx" ON "interview_transcripts" ("organization_id", "created_at");

CREATE TABLE "interview_scorecard_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "panelist_user_id" UUID NOT NULL,
    -- [{ itemId, skill, rating, note, quote }]: the AI's suggestion only; nothing is submitted from here.
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "interview_scorecard_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "interview_scorecard_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "interview_scorecard_drafts_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "interview_scorecard_drafts_key" ON "interview_scorecard_drafts" ("interview_id", "panelist_user_id");
CREATE INDEX "interview_scorecard_drafts_age_idx" ON "interview_scorecard_drafts" ("organization_id", "created_at");

ALTER TABLE "interview_notetaker_consents" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "interview_notetaker_consents"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "interview_transcripts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "interview_transcripts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
ALTER TABLE "interview_scorecard_drafts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "interview_scorecard_drafts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
