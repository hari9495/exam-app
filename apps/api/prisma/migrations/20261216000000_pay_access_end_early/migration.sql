-- HR may end a manager's team pay access before its last day (People › Team pay access › End access), and revoking the
-- grant in Settings › Roles & access ends the request too. Who ended it, when and why stay on the request; valid_to
-- becomes the day it ended.
ALTER TABLE "pay_access_requests" ADD COLUMN "ended_by" UUID;
ALTER TABLE "pay_access_requests" ADD COLUMN "ended_at" TIMESTAMPTZ(3);
ALTER TABLE "pay_access_requests" ADD COLUMN "end_note" VARCHAR(500);
ALTER TABLE "pay_access_requests" ADD CONSTRAINT "pay_access_requests_ended_check" CHECK (
    ("ended_at" IS NULL) = ("ended_by" IS NULL)
    AND ("ended_at" IS NULL) = ("end_note" IS NULL)
    AND ("ended_at" IS NULL OR "status" = 'approved'));
