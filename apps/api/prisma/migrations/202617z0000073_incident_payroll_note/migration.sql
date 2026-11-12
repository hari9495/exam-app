-- Founder answer 1206 (12 Nov 2026): staff may tick the payroll-day note on an incident update; the company banner then
-- adds the fixed sentence (in the kit). Schema only; no data written.
ALTER TABLE "platform_incident_updates" ADD COLUMN "payroll_note" BOOLEAN NOT NULL DEFAULT false;
