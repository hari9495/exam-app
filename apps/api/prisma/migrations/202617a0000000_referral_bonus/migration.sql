-- HIR-12 referrals: the bonus promised when the referral is made (the company setting ats.referral.bonus_inr at that
-- moment, whole rupees), so a later change of the setting never alters it. Older referrals stay NULL and read the
-- current setting. Schema only: no data is written.
ALTER TABLE "referrals" ADD COLUMN "bonus_inr" INTEGER;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_bonus_inr_check" CHECK ("bonus_inr" IS NULL OR "bonus_inr" >= 0);
