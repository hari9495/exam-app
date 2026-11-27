-- Batch T2-D items 58 and 59 (answers 2869, 2870): a project's own settings, set by its manager. NULL follows the
-- company rule. booking_rule: 'allocated' (everyone allocated) or 'named' (only booking_employee_ids); notes_required
-- and billable_default override the company's comment rule and the project's billing model for new rows. A second
-- approver (second_approver_user_id) decides each line after the project manager, before the client.
ALTER TABLE "timesheet_projects" ADD COLUMN "booking_rule" VARCHAR(10);
ALTER TABLE "timesheet_projects" ADD COLUMN "booking_employee_ids" UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE "timesheet_projects" ADD COLUMN "notes_required" BOOLEAN;
ALTER TABLE "timesheet_projects" ADD COLUMN "billable_default" BOOLEAN;
ALTER TABLE "timesheet_projects" ADD COLUMN "second_approver_user_id" UUID;
ALTER TABLE "timesheet_projects" ADD CONSTRAINT "timesheet_projects_booking_rule_check" CHECK ("booking_rule" IS NULL OR "booking_rule" IN ('allocated', 'named'));
-- T2-D 59: the approval level a pending line waits at (1 the project manager, 2 the second approver).
ALTER TABLE "timesheet_lines" ADD COLUMN "level" SMALLINT NOT NULL DEFAULT 1;
