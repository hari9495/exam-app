-- Helpdesk (founder answer 1643): after the stars a requester may pick one preset reason. The list is a desk
-- setting (this starter list until the desk changes it); the reason is kept with the rating and shows in reports.
ALTER TABLE "sd_desks" ADD COLUMN "rating_reasons" VARCHAR(40)[] NOT NULL DEFAULT ARRAY['Quick help', 'Solved my problem', 'Friendly and clear', 'Slow', 'Not solved', 'Had to explain again']::VARCHAR(40)[];
ALTER TABLE "sd_desks" ADD CONSTRAINT "sd_desks_rating_reasons_check" CHECK (cardinality("rating_reasons") <= 12);
ALTER TABLE "sd_ratings" ADD COLUMN "reason" VARCHAR(40);
