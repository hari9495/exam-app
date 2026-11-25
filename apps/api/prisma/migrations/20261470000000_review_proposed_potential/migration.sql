-- Founder 3 Nov 2026 (13): the manager proposes 9-box potential in the PRF-05 manager review; calibration starts from it.
-- 1 low, 2 medium, 3 high; null until proposed. The facilitator's own value (reviews.potential) wins once set.
-- reviews already has row-level security; a new column needs nothing more.
ALTER TABLE reviews ADD COLUMN proposed_potential SMALLINT;
ALTER TABLE reviews ADD CONSTRAINT reviews_proposed_potential_range CHECK (proposed_potential IS NULL OR proposed_potential BETWEEN 1 AND 3);
