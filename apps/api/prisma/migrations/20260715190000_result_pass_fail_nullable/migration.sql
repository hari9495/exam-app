-- AlterTable
-- Result.passFail becomes nullable: settlement now needs to represent a "pending" state
-- (an attempt containing an ungraded `code` question) distinct from a real pass/fail,
-- until a recruiter finalizes manual grading (see attempt-settlement.service.ts finalize()/finalizeManualGrade()).
ALTER TABLE [results] ALTER COLUMN [pass_fail] NVARCHAR(1000) NULL;
