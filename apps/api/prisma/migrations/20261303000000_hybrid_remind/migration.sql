-- TIM-41 hybrid office days: a manager or HR reminds someone to plan their office days ("Remind" on the planner and in
-- Compliance). The same once-a-day nudge record as "check in", with one more item.
ALTER TABLE "nudges" DROP CONSTRAINT "nudges_item_check";
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_item_check" CHECK ("item" IN ('check_in', 'hybrid_plan'));
