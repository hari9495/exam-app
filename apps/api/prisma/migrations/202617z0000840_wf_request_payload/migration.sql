-- E2 part 1 (review item 6): a request keeps the values that routed it and the company policy version used, so "Try it"
-- on past requests and audits have data to run on. payload holds only the request type's declared fields; policy_version
-- is null when the module's built-in steps were used.
ALTER TABLE "wf_requests" ADD COLUMN "payload" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "wf_requests" ADD COLUMN "policy_version" INTEGER;
