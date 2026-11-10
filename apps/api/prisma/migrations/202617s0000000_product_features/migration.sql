-- Careers answer 442: what each plan includes, as data. D15: one plan per product, and white-label is included in
-- every product's plan. YukthiX staff switch brand.white_label on for a company only when one of its products has it.
ALTER TABLE "products" ADD COLUMN "features" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "products" ADD CONSTRAINT "products_features_check" CHECK ("features" <@ ARRAY['white_label']::TEXT[]);
UPDATE "products" SET "features" = ARRAY['white_label'] WHERE "code" IN ('hrms', 'service_desk');
