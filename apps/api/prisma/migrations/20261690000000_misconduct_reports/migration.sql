-- HLP-08 founder answers 55 and 56 (4 Nov 2026). (55) A manager reports misconduct by one of their own reports: it
-- reaches HR as a DRAFT disciplinary case (no members, nobody sees it but HR with case.disciplinary.raise in scope), which
-- HR opens (it becomes an ordinary case) or declines with a reason. The manager sees only received / opened / declined.
-- (56) An approved warning is issued through Letters (the company's "warning" letter template); the case keeps the step.

ALTER TABLE "speakup_cases" DROP CONSTRAINT "speakup_cases_status_check";
ALTER TABLE "speakup_cases" ADD CONSTRAINT "speakup_cases_status_check" CHECK ("status" IN ('draft', 'declined', 'received', 'acknowledged', 'investigation', 'closed'));
ALTER TABLE "speakup_cases"
  -- Who started a disciplinary case: HR, or a manager's report (a draft until HR decides).
  ADD COLUMN "source" VARCHAR(8) NOT NULL DEFAULT 'hr',
  ADD CONSTRAINT "speakup_cases_source_check" CHECK ("source" IN ('hr', 'manager')),
  -- Only a disciplinary case reported by a manager is ever a draft or declined.
  ADD CONSTRAINT "speakup_cases_draft_check" CHECK ("status" NOT IN ('draft', 'declined') OR ("kind" = 'disciplinary' AND "source" = 'manager'));

ALTER TABLE "speakup_case_steps" DROP CONSTRAINT "speakup_case_steps_kind_check";
ALTER TABLE "speakup_case_steps" ADD CONSTRAINT "speakup_case_steps_kind_check" CHECK ("kind" IN (
  'acknowledged', 'notice_sent', 'notice_delayed', 'more_time_asked', 'more_time_decided', 'replied',
  'proposed', 'approved', 'sent_back', 'ic_draft', 'ic_vote', 'ic_signed',
  'relief', 'relief_done', 'recused', 'member_added', 'routed_to_chair', 'file_added', 'severity_set',
  'report_opened', 'report_declined', 'letter_issued'));
-- A declined report keeps its reason.
ALTER TABLE "speakup_case_steps" ADD CONSTRAINT "speakup_case_steps_declined_check"
  CHECK ("kind" <> 'report_declined' OR length(coalesce("data"->>'reason', '')) >= 3);
