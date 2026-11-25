-- Engage follow-ups: repeating surveys and the automatic onboarding / exit survey (2664); Route to HR in moderation (2666).

-- 2664: a launched survey can repeat every month or quarter (each run its own survey), or, for onboarding and exit
-- surveys, invite people as they reach the event (joining + days, or an accepted exit).
ALTER TABLE "eng_surveys" ADD COLUMN "repeat" VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE "eng_surveys" ADD COLUMN "repeated_at" TIMESTAMPTZ(3);
ALTER TABLE "eng_surveys" ADD COLUMN "auto_invite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "eng_surveys" ADD COLUMN "auto_after_days" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "eng_surveys" ADD CONSTRAINT "eng_surveys_repeat_check" CHECK ("repeat" IN ('none', 'monthly', 'quarterly'));
ALTER TABLE "eng_surveys" ADD CONSTRAINT "eng_surveys_auto_check" CHECK (NOT "auto_invite" OR ("type" IN ('onboarding', 'exit') AND "repeat" = 'none'));
ALTER TABLE "eng_surveys" ADD CONSTRAINT "eng_surveys_auto_days_check" CHECK ("auto_after_days" BETWEEN 0 AND 365);

-- 2666: a moderator routes a repeat author to HR (recorded once per item, like the other moderation actions).
ALTER TABLE "eng_mod_actions" DROP CONSTRAINT "eng_mod_actions_action_check";
ALTER TABLE "eng_mod_actions" ADD CONSTRAINT "eng_mod_actions_action_check" CHECK ("action" IN ('approve', 'restore', 'hide', 'delete', 'warn', 'route_hr'));
