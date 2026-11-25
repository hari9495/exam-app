-- HLP-14 round 2 (founder answers 101, 104, 106, 108 and the industry warning, 4 Nov 2026). Rules: helpdesk-design-map 4i.
-- (1) Industries live in a table (a new industry needs no deploy); each names the law tables that apply to it. A draft for
--     an industry whose own tables are not checked carries a counsel note that the publisher must tick as seen.
-- (2) Code of conduct and POSH policy types. POSH quotes IN.POSH; its new version adds the Internal Committee's make-up.
-- (3) Unapproved drafts can be discarded (by a person or the daily clean-up); nothing is deleted.
-- (4) Leave tables (IN.SE) for Maharashtra, Telangana and Delhi, each marked verify, sourced from the state Act.

SELECT set_config('app.is_super_admin', 'on', true);

-- (1) Industries: global, read-only to the app (like statutory_rule_sets).
CREATE TABLE "policy_industries" (
    "code" VARCHAR(30) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    -- Statutes (statutory_rule_sets.statute) that apply to this industry on top of the general labour law.
    "law_statutes" VARCHAR(20)[] NOT NULL DEFAULT '{}',
    "sort" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_industries_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "policy_industries_code_check" CHECK ("code" ~ '^[a-z][a-z0-9_]{1,29}$')
);
-- No industry-specific law table is checked yet (founder question 111): every industry starts with none.
INSERT INTO "policy_industries" ("code", "label", "sort") VALUES
  ('manufacturing', 'Manufacturing', 10),
  ('fmcg', 'Food and consumer goods', 20),
  ('it_services', 'IT services', 30),
  ('retail', 'Retail and shops', 40),
  ('bfsi', 'Banking and financial services', 50),
  ('healthcare', 'Healthcare', 60),
  ('logistics', 'Logistics and transport', 70),
  ('construction', 'Construction', 80),
  ('education', 'Education', 90),
  ('other', 'Other', 1000);
ALTER TABLE "policy_industries" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY read_all ON "policy_industries" FOR SELECT USING (true);
CREATE POLICY platform_write ON "policy_industries" FOR ALL USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE "policy_industries" FROM app_runtime;

-- (2) and (3) Drafts: two more types; discarded (a person, or the clean-up after the company's days).
ALTER TABLE "policy_ai_drafts" DROP CONSTRAINT "policy_ai_drafts_type_check";
ALTER TABLE "policy_ai_drafts" ADD CONSTRAINT "policy_ai_drafts_type_check" CHECK ("policy_type" IN ('leave', 'work_from_home', 'notice', 'conduct', 'posh'));
ALTER TABLE "policy_ai_drafts" DROP CONSTRAINT "policy_ai_drafts_status_check";
ALTER TABLE "policy_ai_drafts" ADD CONSTRAINT "policy_ai_drafts_status_check" CHECK ("status" IN ('draft', 'approved', 'discarded'));
ALTER TABLE "policy_ai_drafts"
  ADD COLUMN "discarded_by" UUID,
  ADD COLUMN "discarded_at" TIMESTAMPTZ(3),
  ADD COLUMN "discard_reason" VARCHAR(10),
  ADD CONSTRAINT "policy_ai_drafts_discard_reason_check" CHECK ("discard_reason" IS NULL OR "discard_reason" IN ('manual', 'expired')),
  ADD CONSTRAINT "policy_ai_drafts_discarded_check" CHECK ("status" <> 'discarded' OR ("discarded_at" IS NOT NULL AND "discard_reason" IS NOT NULL AND ("discard_reason" = 'expired' OR "discarded_by" IS NOT NULL)));

-- An approved or discarded draft never changes.
CREATE OR REPLACE FUNCTION policy_ai_drafts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('approved', 'discarded') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'an approved or discarded policy draft never changes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- (1) The counsel note travels with the version; it is never published unticked.
ALTER TABLE "policy_versions"
  ADD COLUMN "counsel_note" VARCHAR(300),
  ADD COLUMN "counsel_seen_by" UUID,
  ADD COLUMN "counsel_seen_at" TIMESTAMPTZ(3),
  ADD CONSTRAINT "policy_versions_counsel_check" CHECK ("status" <> 'published' OR "counsel_note" IS NULL OR ("counsel_seen_by" IS NOT NULL AND "counsel_seen_at" IS NOT NULL));

-- (2) IN.POSH from today adds the Internal Committee's make-up (s.4); the time limits are unchanged from 2013-v1.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.POSH', 'IN', '2013-v2', '2026-11-04',
   '{"filingMonths":3,"filingExtensionMonths":3,"inquiryDays":90,"reportDays":10,"actionDays":60,"ic":{"requiredFromHeadcount":10,"presidingWoman":true,"employeeMembersMin":2,"externalMembers":1,"womenShareMin":0.5,"termYearsMax":3}}',
   'POSH Act, 2013: s.4(1) an Internal Committee at every office of ten or more workers; s.4(2)(a) a senior woman employee presides; s.4(2)(b) at least two employee members; s.4(2)(c) one member from an NGO or association committed to the cause of women; s.4(2) proviso at least half the members women; s.4(3) term up to three years. Time limits as 2013-v1. Verify with counsel.', true);

-- (4) State leave tables. Floors: the least days a year; carry: the least an employee may carry forward. Figures only
-- where the Act states a fixed number; what it states as a rate is listed in "notes" and shown as not checked.
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "values", "source", "verify") VALUES
  ('IN.SE', 'IN-MH', '2017-v1', '2017-12-19',
   '{"floors":[{"kinds":["casual"],"days":8}],"carry":{"earned":45},"notes":["Earned leave in Maharashtra is one day for every twenty days worked in the previous year (workers with 240 days or more), not a fixed number a year: not checked."]}',
   'Maharashtra Shops and Establishments (Regulation of Employment and Conditions of Service) Act, 2017: s.18(2) eight days casual leave a calendar year; s.18(3) one day for every twenty days worked (240 days or more); s.18(5) earned leave accumulates to forty-five days. Verify before go-live.', true),
  ('IN.SE', 'IN-TS', '1988-v1', '2014-06-02',
   '{"floors":[{"kinds":["earned"],"days":15},{"kinds":["sick"],"days":12},{"kinds":["casual"],"days":12}],"carry":{"earned":60}}',
   'Telangana Shops and Establishments Act, 1988: s.30(1) fifteen days leave with wages after twelve months, accumulated to sixty days; s.30(5)(a) twelve days for sickness or accident; s.30(5)(b) twelve days casual leave; s.33 the Government may raise these by notification. Verify before go-live.', true),
  ('IN.SE', 'IN-DL', '1954-v1', '2000-01-01',
   '{"floors":[{"kinds":["earned"],"days":15},{"kinds":["casual","sick"],"days":12}],"carry":{"earned":45}}',
   'Delhi Shops and Establishments Act, 1954: s.22(1)(a) privilege leave not less than fifteen days after twelve months; s.22(1)(b) sickness or casual leave not less than twelve days a year (not accumulated); s.22(1A) privilege leave accumulates to three times the yearly period (forty-five days). Verify before go-live.', true);
