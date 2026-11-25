-- Tier 1 batch A item C4 (attendance-leave C4, answer 2313): Apply leave names up to 10 colleagues to tell. They are told
-- on approval (not on applying), with the dates only, never the leave type or the reason.
ALTER TABLE "leave_requests" ADD COLUMN "notify_user_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_notify_user_ids_check" CHECK (cardinality("notify_user_ids") <= 10);
