-- Performance (M06-BUILD-DESIGN §15.3): HR who handle concerns seal a review comment, as they seal feedback (PM3).
-- The ratings stay; the texts leave every view except the sealer's; the reason is audited.
ALTER TABLE "review_entries" ADD COLUMN "sealed_at" TIMESTAMPTZ(3), ADD COLUMN "sealed_by" UUID, ADD COLUMN "seal_reason" VARCHAR(500);
ALTER TABLE "review_entries" ADD CONSTRAINT "review_entries_seal_check" CHECK (("sealed_at" IS NULL) = ("seal_reason" IS NULL));
