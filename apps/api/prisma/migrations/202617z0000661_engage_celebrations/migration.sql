-- Batch G2 item 76 (M09 Q5, answer 2605): celebrations (birthdays without the year, work anniversaries, new joiners) on the
-- feed, each with a personal opt-out per kind (a birthday also stays hidden when the person hides it in their profile).
CREATE TABLE "eng_celebration_optouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eng_celebration_optouts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "eng_celebration_optouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "eng_celebration_optouts_kind_check" CHECK ("kind" IN ('birthday', 'anniversary', 'new_joiner'))
);
CREATE UNIQUE INDEX "eng_celebration_optouts_key" ON "eng_celebration_optouts"("organization_id", "user_id", "kind");

ALTER TABLE "eng_celebration_optouts" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "eng_celebration_optouts"
  USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
  WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()));
CREATE POLICY support_session_excluded ON "eng_celebration_optouts" AS RESTRICTIVE
  USING ((SELECT app_support_session()) IS NULL)
  WITH CHECK ((SELECT app_support_session()) IS NULL);
CREATE POLICY portal_none ON "eng_celebration_optouts" AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL);
