-- Founder request, answers 1731 to 1736 (12 Nov 2026): a required note per timesheet row. The note widens from 200
-- characters (a note of at least 200 words needs room); a project may show its notes to the client in the portal (off by
-- default). No data is written.
ALTER TABLE "timesheet_lines" ALTER COLUMN "note" TYPE VARCHAR(4000);
ALTER TABLE "timesheet_projects" ADD COLUMN "client_sees_notes" BOOLEAN NOT NULL DEFAULT false;
