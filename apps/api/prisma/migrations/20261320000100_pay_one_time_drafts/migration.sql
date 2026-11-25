-- PAY-05 List (pay gaps, 2 Nov 2026): one-time pay can be saved as a draft and sent for approval (or deleted) later,
-- one by one or in bulk. A draft is never paid (runs read approved items only). A deleted draft stays as 'cancelled'
-- (the app role still cannot delete rows). Forward-only; RLS on one_time_pays is unchanged.
ALTER TABLE "one_time_pays" DROP CONSTRAINT "one_time_pays_status_check";
ALTER TABLE "one_time_pays" ADD CONSTRAINT "one_time_pays_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'rejected', 'cancelled'));
