-- IT assets, the part with no open question (plan 26 Nov 2026): plain details on the asset page.
-- Maker, model, invoice number and warranty months; the warranty end date follows from the purchase date.
ALTER TABLE "assets" ADD COLUMN "maker" VARCHAR(100);
ALTER TABLE "assets" ADD COLUMN "model" VARCHAR(100);
ALTER TABLE "assets" ADD COLUMN "invoice_number" VARCHAR(60);
ALTER TABLE "assets" ADD COLUMN "warranty_months" SMALLINT;
ALTER TABLE "assets" ADD CONSTRAINT "assets_warranty_months_check" CHECK ("warranty_months" IS NULL OR "warranty_months" BETWEEN 0 AND 120);
