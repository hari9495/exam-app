-- Lifecycle batch 6f (M01-LIFECYCLE-BUILD-DESIGN §5.7, §7.5): life-event journeys and read / watch / quick-survey steps.
-- No new tables; the 6a journey tables take more kinds and subjects. RLS on them is unchanged.

ALTER TABLE "journey_templates" ALTER COLUMN "kind" TYPE VARCHAR(16);
ALTER TABLE "journeys" ALTER COLUMN "kind" TYPE VARCHAR(16), ALTER COLUMN "subject_type" TYPE VARCHAR(16);

ALTER TABLE "journey_templates" DROP CONSTRAINT "journey_templates_kind_check";
ALTER TABLE "journey_templates" ADD CONSTRAINT "journey_templates_kind_check" CHECK ("kind" IN ('onboarding', 'offboarding', 'new_manager', 'transfer', 'parental_leave', 'return_to_work'));

ALTER TABLE "journeys" DROP CONSTRAINT "journeys_kind_check";
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_kind_check" CHECK ("kind" IN ('onboarding', 'offboarding', 'new_manager', 'transfer', 'parental_leave', 'return_to_work'));
ALTER TABLE "journeys" DROP CONSTRAINT "journeys_subject_check";
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_subject_check" CHECK ("subject_type" IN ('preboarding', 'exit_case', 'employment', 'employee_change', 'leave_request'));

ALTER TABLE "journey_template_tasks" DROP CONSTRAINT "journey_template_tasks_kind_check";
ALTER TABLE "journey_template_tasks" ADD CONSTRAINT "journey_template_tasks_kind_check" CHECK ("kind" IN ('tick', 'form', 'document', 'letter', 'desk_request', 'read', 'watch', 'survey'));
ALTER TABLE "journey_tasks" DROP CONSTRAINT "journey_tasks_kind_check";
ALTER TABLE "journey_tasks" ADD CONSTRAINT "journey_tasks_kind_check" CHECK ("kind" IN ('tick', 'form', 'document', 'letter', 'desk_request', 'read', 'watch', 'survey'));

-- The hourly start looks up active templates by kind.
CREATE INDEX "journey_templates_kind_idx" ON "journey_templates" ("organization_id", "kind", "active");
