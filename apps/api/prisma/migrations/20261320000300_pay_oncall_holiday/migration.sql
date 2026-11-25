-- PAY-35 Holiday (pay gaps, 2 Nov 2026): an on-call rule's company choices: a public-holiday multiplier (none = the
-- normal one), whether standby is still paid on a slot with a call-out, and whether call-out hours count towards the
-- weekly hours limit. A slot records whether it fell on a public holiday. Defaults keep today's pay unchanged.
-- Forward-only; RLS on both tables is unchanged (same rows, new columns).
ALTER TABLE "oncall_rules"
  ADD COLUMN "holiday_multiplier" DECIMAL(5,2),
  ADD COLUMN "pay_standby_when_called" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "count_towards_weekly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "oncall_rules" ADD CONSTRAINT "oncall_rules_holiday_multiplier_check" CHECK ("holiday_multiplier" IS NULL OR "holiday_multiplier" >= "multiplier");
ALTER TABLE "oncall_slots" ADD COLUMN "on_holiday" BOOLEAN NOT NULL DEFAULT false;
