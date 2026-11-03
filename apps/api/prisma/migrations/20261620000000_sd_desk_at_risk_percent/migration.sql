-- HLP-05b (founder 3 Nov 2026): each desk chooses its "at risk" point, the share of a response target used before a
-- ticket shows as at risk. Default 80, the rule HLP-02 and HLP-05 used. An existing tenant table (RLS already on).
ALTER TABLE "sd_desks" ADD COLUMN "at_risk_percent" SMALLINT NOT NULL DEFAULT 80,
  ADD CONSTRAINT "sd_desks_at_risk_percent_check" CHECK ("at_risk_percent" IN (50, 60, 70, 80, 90));
