-- IT assets part 1, tag numbering (founder answer 2720): an optional pattern per asset category: a prefix, the year if
-- wanted, and a counter padded to so many digits (LAP-2026-0042). Add asset suggests the next tag; a typed tag still
-- works, and tags stay unique (assets_tag_key).
ALTER TABLE "asset_categories"
  ADD COLUMN "tag_prefix" VARCHAR(12),
  ADD COLUMN "tag_year" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tag_digits" SMALLINT NOT NULL DEFAULT 4,
  ADD CONSTRAINT "asset_categories_tag_prefix_check" CHECK ("tag_prefix" IS NULL OR "tag_prefix" ~ '^[A-Z0-9]{1,12}$'),
  ADD CONSTRAINT "asset_categories_tag_digits_check" CHECK ("tag_digits" BETWEEN 2 AND 8);
