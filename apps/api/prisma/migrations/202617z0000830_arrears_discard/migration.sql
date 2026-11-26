-- E3 review item 9: a draft arrears worksheet is discarded with a reason (kept, with who and when). Worksheets cancelled
-- before this keep their 'cancelled' status.
SELECT set_config('app.is_super_admin', 'on', true);

ALTER TABLE "arrears_worksheets" DROP CONSTRAINT "arrears_worksheets_status_check";
ALTER TABLE "arrears_worksheets" ADD CONSTRAINT "arrears_worksheets_status_check" CHECK ("status" IN ('draft', 'approved', 'cancelled', 'discarded'));
ALTER TABLE "arrears_worksheets" ADD COLUMN "discard_reason" VARCHAR(500);
ALTER TABLE "arrears_worksheets" ADD COLUMN "discarded_by" UUID;
ALTER TABLE "arrears_worksheets" ADD COLUMN "discarded_at" TIMESTAMPTZ(3);
ALTER TABLE "arrears_worksheets" ADD CONSTRAINT "arrears_worksheets_discard_check" CHECK ("status" <> 'discarded' OR ("discard_reason" IS NOT NULL AND "discarded_by" IS NOT NULL AND "discarded_at" IS NOT NULL));
