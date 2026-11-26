-- Answer 2754: a leave type added from the starter gallery remembers which starter it came from (shown as "Starter").
ALTER TABLE "leave_types" ADD COLUMN "starter" VARCHAR(20);
