-- Console tidy (founder answer 1203, 12 Nov 2026): retiring a published YukthiX help article takes two staff members, as
-- publishing does. A request waits until another member of staff approves it; then the article is retired (it leaves
-- every company's Help drawer). Platform data: only the platform (staff) context reads or writes it.
SELECT set_config('app.is_super_admin', 'on', true);

CREATE TABLE "help_article_retirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "article_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(10) NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(3),
    CONSTRAINT "help_article_retirements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "help_article_retirements_article_fkey" FOREIGN KEY ("article_id") REFERENCES "sd_kb_articles"("id"),
    CONSTRAINT "help_article_retirements_requester_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id"),
    CONSTRAINT "help_article_retirements_decider_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id"),
    CONSTRAINT "help_article_retirements_status_check" CHECK ("status" IN ('pending', 'approved')),
    CONSTRAINT "help_article_retirements_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 5 AND 500),
    CONSTRAINT "help_article_retirements_decided_check" CHECK (("status" = 'approved') = ("decided_by" IS NOT NULL)),
    -- The approver is never the person who asked.
    CONSTRAINT "help_article_retirements_four_eyes_check" CHECK ("decided_by" IS NULL OR "decided_by" <> "requested_by")
);
CREATE UNIQUE INDEX "help_article_retirements_pending_key" ON "help_article_retirements" ("article_id") WHERE "status" = 'pending';
ALTER TABLE "help_article_retirements" ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "help_article_retirements" USING ((SELECT app_is_super_admin())) WITH CHECK ((SELECT app_is_super_admin()));
REVOKE DELETE, TRUNCATE ON TABLE "help_article_retirements" FROM app_runtime;
