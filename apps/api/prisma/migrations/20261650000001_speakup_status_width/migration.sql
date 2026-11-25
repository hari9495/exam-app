-- HLP-08: speakup_cases.status allows 'investigation' (13 letters) in its check, but the column was VARCHAR(12), so the
-- first case to reach the inquiry failed. Widen it (no data change).
ALTER TABLE "speakup_cases" ALTER COLUMN "status" TYPE VARCHAR(14);
