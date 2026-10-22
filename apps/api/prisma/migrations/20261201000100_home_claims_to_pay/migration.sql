-- Finance Home (PLT-02 finance, 20 Oct 2026): the daily Home snapshot also keeps "claims approved, to pay" (whole
-- rupees), so the card can say how it changed since last month.
ALTER TABLE "home_snapshots" DROP CONSTRAINT "home_snapshots_metric_check";
ALTER TABLE "home_snapshots" ADD CONSTRAINT "home_snapshots_metric_check"
    CHECK ("metric" IN ('attendance_exceptions', 'not_ready_payroll', 'open_cases', 'joining', 'claims_to_pay'));
