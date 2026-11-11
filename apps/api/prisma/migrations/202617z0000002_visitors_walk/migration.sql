-- Visitors walk-through, founder answer 794: a visitor type no visit uses is removed; one in use is archived (kept for
-- the visits that name it, hidden from new visits).
ALTER TABLE "visitor_types" ADD COLUMN "archived_at" TIMESTAMPTZ(3);
