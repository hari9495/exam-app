-- Answer 502: a candidate a recruiter adds by hand to a New York City job (setting on) is emailed the automated-tool
-- notice; the notice days count from that email (an applicant's from the day they applied, the notice being on the page).
ALTER TABLE "pipeline_entries" ADD COLUMN "tool_notice_at" TIMESTAMPTZ(3);
