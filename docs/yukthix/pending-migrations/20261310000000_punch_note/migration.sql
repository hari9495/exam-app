-- Extra · My attendance today, WithNote (30 Oct 2026): written, NOT applied (the builder may not migrate examapp_org).
-- To make WithNote live: move this folder to apps/api/prisma/migrations, add `note String? @db.VarChar(200)` to
-- model Punch in schema.prisma, accept an optional `note` (trimmed, 1-200 chars) on POST /time/me/punch (PunchDto),
-- write it with the punch in AttendanceService.record and return it in punchView, and let the clock card offer
-- "Add note" in the live app (ClockCard sends it with the next punch; it hides the box today because the API has
-- nowhere to keep it). Additive and nullable: punches stay append-only (the note is written with the punch, never changed).
ALTER TABLE "punches" ADD COLUMN "note" VARCHAR(200);
ALTER TABLE "punches" ADD CONSTRAINT "punches_note_check" CHECK ("note" IS NULL OR length(btrim("note")) BETWEEN 1 AND 200);
