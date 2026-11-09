-- HIR-11 / HIR-12 (founder answer 203): a cost the system posts names what it came from (a referral's id for its paid
-- bonus), so it is posted once and taken back if the payment is undone. Schema only: no data is written.
ALTER TABLE "recruiting_costs" ADD COLUMN "source_ref" VARCHAR(80);
CREATE UNIQUE INDEX "recruiting_costs_source_ref_key" ON "recruiting_costs" ("organization_id", "origin", "source_ref") WHERE "source_ref" IS NOT NULL;
