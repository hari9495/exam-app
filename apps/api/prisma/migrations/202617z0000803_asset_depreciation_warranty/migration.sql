-- IT assets part 2. Answer 2713: how a category depreciates, straight line over its useful life (the default) or
-- declining balance at a yearly rate. Answer 2714: the warranty end an asset's managers were last told about, so the
-- daily job tells them once per warranty end (a changed warranty is told again).
ALTER TABLE "asset_categories"
  ADD COLUMN "depreciation_method" VARCHAR(16) NOT NULL DEFAULT 'straight_line',
  ADD COLUMN "depreciation_rate" DECIMAL(5,2),
  ADD CONSTRAINT "asset_categories_depreciation_method_check" CHECK ("depreciation_method" IN ('straight_line', 'declining')),
  ADD CONSTRAINT "asset_categories_depreciation_rate_check" CHECK ("depreciation_rate" IS NULL OR ("depreciation_rate" > 0 AND "depreciation_rate" < 100)),
  ADD CONSTRAINT "asset_categories_declining_rate_check" CHECK ("depreciation_method" <> 'declining' OR "depreciation_rate" IS NOT NULL);

ALTER TABLE "assets" ADD COLUMN "warranty_alerted_for" DATE;
