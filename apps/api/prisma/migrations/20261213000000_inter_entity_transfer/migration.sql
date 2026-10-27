-- PPL-04 / PPL-10 (P01 YX-ORG-17; founder 27 Oct 2026): a move to another legal entity of the company is a change of
-- its own: the employment in the old entity ends the day before without a settlement and a new one opens on the same
-- employee record. Its continuity checklist (PF UAN, ESI IP, Form 12B, declarations, loans, leave, gratuity) runs on
-- the journey engine as the new journey kind "continuity", shown in payroll pre-flight while items are open.
ALTER TABLE "employee_changes" DROP CONSTRAINT "employee_changes_type_check";
ALTER TABLE "employee_changes" ADD CONSTRAINT "employee_changes_type_check" CHECK ("change_type" IN ('join', 'promotion', 'transfer', 'entity_transfer', 'redesignation', 'manager_change', 'salary_revision', 'employment_type_change', 'confirmation', 'correction', 'notice', 'notice_withdrawal', 'exit'));

ALTER TABLE "journey_templates" DROP CONSTRAINT "journey_templates_kind_check";
ALTER TABLE "journey_templates" ADD CONSTRAINT "journey_templates_kind_check" CHECK ("kind" IN ('onboarding', 'offboarding', 'new_manager', 'transfer', 'parental_leave', 'return_to_work', 'continuity'));
ALTER TABLE "journeys" DROP CONSTRAINT "journeys_kind_check";
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_kind_check" CHECK ("kind" IN ('onboarding', 'offboarding', 'new_manager', 'transfer', 'parental_leave', 'return_to_work', 'continuity'));
