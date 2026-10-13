-- Payroll batch 5i, PAY-9.10 … 9.12: the UAE and US country packs' rule sets carry their own law versions.
ALTER TABLE "statutory_rule_sets" DROP CONSTRAINT "statutory_rule_sets_law_check";
ALTER TABLE "statutory_rule_sets" ADD CONSTRAINT "statutory_rule_sets_law_check" CHECK ("law_version" IS NULL OR "law_version" IN ('OLD-ACT', 'CODE', 'IT-1961', 'IT-2025', 'AE-2021', 'US-IRC'));
