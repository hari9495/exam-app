-- Role templates reach existing companies (P02 §4.2, Q5): a company role made from a template is a copy, and keys added
-- to the template later (lifecycle, payroll, expenses) never reached it. A role now remembers the template it follows and
-- the template's keys it was last brought up to; editing its keys makes it the company's own. At start-up the template
-- sync (access/template-sync.service.ts) recognises existing unchanged copies (their keys equal a past version of a
-- template exactly), adds the keys their template has gained since (never removes; Confidential keys are not added to a
-- role people hold, as an edit could not add them either) and records each change in the audit log.
ALTER TABLE "permission_profiles" ADD COLUMN "template_key" VARCHAR(40);
ALTER TABLE "permission_profiles" ADD COLUMN "template_set" TEXT;
ALTER TABLE "permission_profiles" ADD COLUMN "template_checked" BOOLEAN NOT NULL DEFAULT false;
