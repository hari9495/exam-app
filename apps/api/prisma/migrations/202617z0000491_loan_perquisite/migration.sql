-- Batch H part 3 item D14 (18 Nov 2026), founder answers 2404 and 2405 (docs/yukthix/reference/statutory/india-state-rules-2026-27.md):
-- the perquisite on a concessional loan (Income-tax Rules, Rule 3(7)(i)): each month, the maximum outstanding of the month
-- times (the SBI reference rate for the loan type less the loan's own rate). Loans for medical treatment, and loans that
-- add up to 20,000 or less, are exempt. A CA enters the SBI rates; until then every rate is null and nothing is worked out.

-- The loan type the SBI rate is read for, and the company's "exempt, with reason" mark (medical treatment).
ALTER TABLE "loans" ADD COLUMN "perq_purpose" VARCHAR(10) NOT NULL DEFAULT 'personal';
ALTER TABLE "loans" ADD COLUMN "perq_exempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "loans" ADD COLUMN "perq_exempt_reason" VARCHAR(300);
ALTER TABLE "loans" ADD CONSTRAINT "loans_perq_purpose_check" CHECK ("perq_purpose" IN ('housing', 'vehicle', 'education', 'personal', 'other'));
ALTER TABLE "loans" ADD CONSTRAINT "loans_perq_exempt_reason_check" CHECK (NOT "perq_exempt" OR "perq_exempt_reason" IS NOT NULL);

-- A perquisite payroll wrote for one month (the loan perquisite): which loan and month, so a revised payslip replaces it.
ALTER TABLE "perquisites" ADD COLUMN "source_ref" VARCHAR(80);
ALTER TABLE "perquisites" ADD COLUMN "period_start" DATE;
CREATE UNIQUE INDEX "perquisites_source_ref_key" ON "perquisites" ("organization_id", "source_ref") WHERE "source_ref" IS NOT NULL;

-- IN.PERQ-LOAN TY2026-27: rates as on 1 Apr 2026 (Rule 3(7)(i) reads the rate on the first day of the tax year), per loan
-- type, percent a year; null until a CA loads them through the console (a new version, reviewed and published).
INSERT INTO "statutory_rule_sets" ("statute", "jurisdiction", "version", "valid_from", "valid_to", "values", "source", "verify", "status", "law_version", "published_at") VALUES ('IN.PERQ-LOAN', 'IN', 'TY2026-27', '2026-04-01', '2027-03-31', '{"kind":"loan_perquisite","rates":{"housing":null,"vehicle":null,"education":null,"personal":null,"other":null},"exemptAggregate":"20000","medicalExempt":true}', 'Income-tax Rules, Rule 3(7)(i): interest at the SBI rate for the same type of loan on the first day of the year, on the maximum outstanding monthly balance, less the interest charged. Exempt: loans for medical treatment of the diseases in Rule 3A, and loans totalling 20,000 or less (founder answer 2404). TODO: a CA enters the SBI rates per loan type and confirms the 20,000 limit (CA checklist).', true, 'published', 'IT-2025', CURRENT_TIMESTAMP);
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'No SBI rate loaded: nothing is worked out', 'loan_perquisite', '{"loans":[{"purpose":"personal","ratePct":"0","maxOutstanding":"300000","exempt":false}]}', '{"total":"0","ratesMissing":true,"smallTotal":false}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PERQ-LOAN' AND "jurisdiction" = 'IN' AND "version" = 'TY2026-27';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'Loans totalling 20,000 (the limit): exempt', 'loan_perquisite', '{"loans":[{"purpose":"personal","ratePct":"0","maxOutstanding":"20000","exempt":false}]}', '{"total":"0","ratesMissing":false,"smallTotal":true}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PERQ-LOAN' AND "jurisdiction" = 'IN' AND "version" = 'TY2026-27';
INSERT INTO "statutory_golden_cases" ("rule_set_id", "name", "fn", "input", "expected") SELECT "id", 'A medical loan: exempt', 'loan_perquisite', '{"loans":[{"purpose":"personal","ratePct":"0","maxOutstanding":"300000","exempt":true}]}', '{"total":"0","ratesMissing":false,"smallTotal":false}' FROM "statutory_rule_sets" WHERE "statute" = 'IN.PERQ-LOAN' AND "jurisdiction" = 'IN' AND "version" = 'TY2026-27';
