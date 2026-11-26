-- Batch G1 answer 2597: a POSH complaint keeps "filed on her behalf" (her name and the relationship), why it was not filed
-- earlier, and whether she asks for conciliation first, in their own fields instead of inside the complaint text.
ALTER TABLE "speakup_cases" ADD COLUMN "on_behalf_name" VARCHAR(150), ADD COLUMN "on_behalf_relation" VARCHAR(100),
  ADD COLUMN "late_reason" VARCHAR(1000), ADD COLUMN "conciliation_asked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "speakup_cases" ADD CONSTRAINT "speakup_cases_posh_fields_check" CHECK ("kind" = 'posh' OR ("on_behalf_name" IS NULL AND "on_behalf_relation" IS NULL AND "late_reason" IS NULL AND NOT "conciliation_asked"));
ALTER TABLE "speakup_cases" ADD CONSTRAINT "speakup_cases_on_behalf_check" CHECK (("on_behalf_name" IS NULL) = ("on_behalf_relation" IS NULL));
