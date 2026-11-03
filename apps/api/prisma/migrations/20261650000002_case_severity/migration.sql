-- HLP-09 founder answer 35 (4 Nov 2026): the ethics officer sets a fraud or ethics report Serious or Standard. Each change
-- is one more append-only case step ('severity_set', with the old and new value); the report's severity is the latest.
ALTER TABLE "speakup_case_steps" DROP CONSTRAINT "speakup_case_steps_kind_check";
ALTER TABLE "speakup_case_steps" ADD CONSTRAINT "speakup_case_steps_kind_check" CHECK ("kind" IN (
  'acknowledged', 'notice_sent', 'notice_delayed', 'more_time_asked', 'more_time_decided', 'replied',
  'proposed', 'approved', 'sent_back', 'ic_draft', 'ic_vote', 'ic_signed',
  'relief', 'relief_done', 'recused', 'member_added', 'routed_to_chair', 'file_added', 'severity_set'));
-- A severity step names exactly one of the two values, and a change (never the same value again).
ALTER TABLE "speakup_case_steps" ADD CONSTRAINT "speakup_case_steps_severity_check"
  CHECK ("kind" <> 'severity_set' OR ("data"->>'to' IN ('serious', 'standard') AND "data"->>'from' IN ('serious', 'standard') AND "data"->>'to' <> "data"->>'from'));
