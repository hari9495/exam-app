-- C-4 / C-8 (founder, 13 Nov 2026): DPDP Rules 2025, Rule 7 (in force from 13 May 2027). After a personal data breach
-- the Data Protection Board is told without delay, then gets the detailed report within 72 hours (as built). Staff mark
-- the first notice as sent (when, and a note); until then the reminder sweep nudges the Security leads every
-- breach.dpdp_board_notice_nudge_minutes. Both steps carry "verify with counsel".
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "company_containments"
  ADD COLUMN "board_notified_at" TIMESTAMPTZ(3),
  ADD COLUMN "board_notice_note" VARCHAR(500),
  ADD COLUMN "board_notified_by" UUID,
  ADD COLUMN "board_notified_by_name" VARCHAR(200),
  ADD COLUMN "board_nudged_at" TIMESTAMPTZ(3);

INSERT INTO "platform_settings" ("key", "value", "label", "verify") VALUES
  ('breach.dpdp_board_notice_nudge_minutes', '60', 'DPDP Rules 2025, Rule 7: the Data Protection Board is told without delay; remind the Security leads every (minutes) until the first notice is marked sent', true)
ON CONFLICT ("key") DO NOTHING;
