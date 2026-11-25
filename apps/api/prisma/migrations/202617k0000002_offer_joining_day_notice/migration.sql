-- HIR-09 founder answer 335: HR decides open offer conditions and is told on the joining day (once per offer); this
-- records when that notice went. Schema only: no data is written.
ALTER TABLE "offers" ADD COLUMN "conditions_notice_at" TIMESTAMPTZ(3);
