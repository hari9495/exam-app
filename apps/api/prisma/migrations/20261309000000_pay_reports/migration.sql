-- PAY-25 payroll reports (30 Oct 2026): read-only reports from approved payslips, loans, holds and arrears, behind the
-- pay guard and a new key. No new tables. The indexes keep the month-range reads off full scans.
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'payroll.reports.view', 'See and export payroll reports (salary register, reconciliation, variance, CTC, arrears, year to date, bank advice, hold ageing, gratuity provision, loan ledger) for the legal entities in scope')
ON CONFLICT DO NOTHING;

-- Approved payslips of an entity by month (every report reads these).
CREATE INDEX IF NOT EXISTS "payslips_report_idx" ON "payslips" ("organization_id", "legal_entity_id", "period_start") WHERE "status" = 'approved';
-- A person's department and location on a day (the department and location filters).
CREATE INDEX IF NOT EXISTS "employee_assignments_employment_idx" ON "employee_assignments" ("organization_id", "employment_id", "valid_from") WHERE "superseded_at" IS NULL;
-- A loan's recoveries (the loan ledger).
CREATE INDEX IF NOT EXISTS "loan_repayments_loan_idx" ON "loan_repayments" ("organization_id", "loan_id");
