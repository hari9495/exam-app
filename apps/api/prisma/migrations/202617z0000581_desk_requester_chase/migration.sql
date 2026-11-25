-- Batch F GLPI 4 (answer 2571): a desk chases a requester who does not answer. While a ticket waits for the
-- requester (a "pending" status), one reminder each business day, at most chase_max, then the ticket is solved after
-- chase_solve_days business days with no reply (the requester may reopen it within the desk's reopen window).
ALTER TABLE "sd_desks"
  ADD COLUMN "chase_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "chase_max" SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN "chase_solve_days" SMALLINT NOT NULL DEFAULT 5,
  ADD CONSTRAINT "sd_desks_chase_max_check" CHECK ("chase_max" BETWEEN 0 AND 10),
  ADD CONSTRAINT "sd_desks_chase_solve_days_check" CHECK ("chase_solve_days" BETWEEN 1 AND 30 AND "chase_solve_days" > "chase_max");
