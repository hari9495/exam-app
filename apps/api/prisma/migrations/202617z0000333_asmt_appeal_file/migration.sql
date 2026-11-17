-- AS-5 part 2 (answer 2264): one file with an appeal (a PDF or image up to 10 MB, checked by its first bytes), stored
-- privately and opened by reviewers through an audited short-lived link.
ALTER TABLE "integrity_appeals" ADD COLUMN "evidence_path" TEXT, ADD COLUMN "evidence_name" VARCHAR(255), ADD COLUMN "evidence_type" VARCHAR(40);
