-- HIR-12 founder answer 285: a referral bonus "paid outside payroll" posts its Referral bonus cost at once, with the
-- origin outside_payroll (linked to the referral by source_ref, one per referral). No data is changed.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "recruiting_costs" DROP CONSTRAINT "recruiting_costs_origin_check";
ALTER TABLE "recruiting_costs" ADD CONSTRAINT "recruiting_costs_origin_check" CHECK ("origin" IN ('manual', 'payroll', 'assessment', 'outside_payroll'));
