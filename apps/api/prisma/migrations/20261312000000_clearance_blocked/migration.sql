-- PPL-20 (founder build 2 Nov 2026): a clearance owner can mark an open item "blocked" with the reason (e.g. an
-- unclaimed advance). The item stays open (not signed off; it still holds F&F finalisation); signing it off or
-- waiving it later clears the block. Forward-only; RLS on clearance_items is unchanged (same rows, new columns).
ALTER TABLE "clearance_items"
  ADD COLUMN "blocked_reason" VARCHAR(300),
  ADD COLUMN "blocked_at" TIMESTAMPTZ(3),
  ADD COLUMN "blocked_by" UUID;

-- A block has its reason and time together, and only while the item is open.
ALTER TABLE "clearance_items"
  ADD CONSTRAINT "clearance_items_blocked_check" CHECK (("blocked_at" IS NULL) = ("blocked_reason" IS NULL) AND ("blocked_at" IS NULL OR "status" = 'open'));
