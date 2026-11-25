-- HIR-11 recruiting costs: the designed cost types (job board, agency fee, referral bonus, assessment, event, other;
-- 'posting' stays for rows recorded before) and where a row came from (typed by a person, or posted by payroll or the
-- assessment settings). Schema only: no data is written.
ALTER TABLE "recruiting_costs" DROP CONSTRAINT "recruiting_costs_type_check";
ALTER TABLE "recruiting_costs" ADD CONSTRAINT "recruiting_costs_type_check"
  CHECK ("cost_type" IN ('posting', 'job_board', 'agency_fee', 'referral_bonus', 'assessment', 'event', 'other'));
ALTER TABLE "recruiting_costs" ADD CONSTRAINT "recruiting_costs_origin_check" CHECK ("origin" IN ('manual', 'payroll', 'assessment'));
