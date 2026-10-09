-- Service Desk phase 3b-1, batch 4, the last batch of phase 1 (M14-BUILD-DESIGN §5.2 "Knowledge and feedback",
-- "Reporting, privacy, set-up", §3 use 2, §14.1, §14.5; slices SD-1.24 … SD-1.27, SD-1.29 … SD-1.31):
--   knowledge spaces with a category tree, articles with versions, review and approval, audiences, languages, short
--   numbers and old addresses kept for redirects; reusable blocks and templates; links to tickets (solved by), feedback,
--   anonymous search and view counts for the content-gap and self-service reports; followers;
--   CSAT on every closed ticket and NPS surveys, both through single-use links (no tracking pixels, D9);
--   daily KPI snapshots with targets, saved and scheduled reports, view-only wallboards;
--   directory sync (LDAP, SCIM) for companies that use only the Service Desk;
--   requester privacy requests, retention and the recycle bin;
--   YukthiX's own support: the platform tenant, customer accounts linked to a company, console agents and the two
--   narrow SECURITY DEFINER bridge functions sd_support_intake() / sd_support_my_tickets().
--
-- Every new table: organization_id NOT NULL + forced RLS with the standard tenant_isolation policy, composite keys.

-- ---------------------------------------------------------------------------------------------
-- SD-1.24 knowledge (US-B-104 … US-B-106, US-G-217, US-G-222).
-- audience: agents (internal), requesters (the people who raise to the space's desk; with no desk, the company's
-- employees), public (anyone, on the public help centre).
CREATE TABLE "sd_kb_spaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "audience" VARCHAR(10) NOT NULL,
    "languages" TEXT[] NOT NULL DEFAULT '{en}',
    "status" VARCHAR(10) NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_spaces_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_spaces_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_kb_spaces_slug_key" UNIQUE ("organization_id", "slug"),
    CONSTRAINT "sd_kb_spaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_spaces_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_kb_spaces_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
    CONSTRAINT "sd_kb_spaces_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_kb_spaces_audience_check" CHECK ("audience" IN ('agents', 'requesters', 'public')),
    -- The four launch languages (P04 Q4, YX-GRO-07); English is always there (the fallback).
    CONSTRAINT "sd_kb_spaces_languages_check" CHECK ("languages" <@ ARRAY['en', 'hi', 'ta', 'te']::text[] AND 'en' = ANY ("languages")),
    CONSTRAINT "sd_kb_spaces_status_check" CHECK ("status" IN ('active', 'off'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_kb_spaces" FROM app_runtime;

-- US-G-217: categories, sections and sub-sections (three levels at most, checked by the API).
CREATE TABLE "sd_kb_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_categories_space_id_key" UNIQUE ("organization_id", "space_id", "id"),
    CONSTRAINT "sd_kb_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_categories_space_fkey" FOREIGN KEY ("organization_id", "space_id") REFERENCES "sd_kb_spaces"("organization_id", "id"),
    CONSTRAINT "sd_kb_categories_parent_fkey" FOREIGN KEY ("organization_id", "space_id", "parent_id") REFERENCES "sd_kb_categories"("organization_id", "space_id", "id"),
    CONSTRAINT "sd_kb_categories_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_kb_categories_parent_check" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

-- An article in one language. A translation points at its English original (translation_of_id). title / summary /
-- body are the PUBLISHED text (what readers and search see); drafts live only in sd_kb_article_versions. audience is a
-- copy of the space's, kept in step by trigger, so the reader policy below is a fast column check.
CREATE TABLE "sd_kb_articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "category_id" UUID,
    -- US-G-216: a short number that never changes, per company.
    "number" INTEGER NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "language" VARCHAR(2) NOT NULL DEFAULT 'en',
    "translation_of_id" UUID,
    "audience" VARCHAR(10) NOT NULL,
    "state" VARCHAR(10) NOT NULL DEFAULT 'draft',
    "owner_user_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(300),
    "body_html" TEXT NOT NULL DEFAULT '',
    "body_text" TEXT NOT NULL DEFAULT '',
    -- US-G-215: what search engines show (public articles only).
    "seo_title" VARCHAR(70),
    "seo_description" VARCHAR(160),
    "published_version" INTEGER,
    "published_at" TIMESTAMPTZ(3),
    -- US-G-222: publish later, hide or flag for review at a date.
    "publish_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "expiry_action" VARCHAR(6) NOT NULL DEFAULT 'flag',
    "review_due_on" DATE,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    -- US-G-023: flagged out of date by an agent (the owner gets a task).
    "outdated" BOOLEAN NOT NULL DEFAULT false,
    "outdated_reason" VARCHAR(300),
    -- US-B-106: the ticket the article was made from (shown to agents only).
    "source_ticket_id" UUID,
    -- US-G-218: in the recycle bin since (restorable until the bin row's purge_after).
    "deleted_at" TIMESTAMPTZ(3),
    "search" tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("summary", '') || ' ' || coalesce("body_text", '')), 'B')) STORED,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_articles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_articles_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_kb_articles_number_key" UNIQUE ("organization_id", "number"),
    CONSTRAINT "sd_kb_articles_slug_key" UNIQUE ("organization_id", "space_id", "language", "slug"),
    CONSTRAINT "sd_kb_articles_translation_key" UNIQUE ("organization_id", "translation_of_id", "language"),
    CONSTRAINT "sd_kb_articles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_articles_space_fkey" FOREIGN KEY ("organization_id", "space_id") REFERENCES "sd_kb_spaces"("organization_id", "id"),
    CONSTRAINT "sd_kb_articles_category_fkey" FOREIGN KEY ("organization_id", "space_id", "category_id") REFERENCES "sd_kb_categories"("organization_id", "space_id", "id"),
    CONSTRAINT "sd_kb_articles_translation_fkey" FOREIGN KEY ("organization_id", "translation_of_id") REFERENCES "sd_kb_articles"("organization_id", "id"),
    CONSTRAINT "sd_kb_articles_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_kb_articles_ticket_fkey" FOREIGN KEY ("organization_id", "source_ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_kb_articles_slug_check" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
    CONSTRAINT "sd_kb_articles_language_check" CHECK ("language" IN ('en', 'hi', 'ta', 'te')),
    CONSTRAINT "sd_kb_articles_translation_check" CHECK (("translation_of_id" IS NULL) = ("language" = 'en')),
    CONSTRAINT "sd_kb_articles_audience_check" CHECK ("audience" IN ('agents', 'requesters', 'public')),
    CONSTRAINT "sd_kb_articles_state_check" CHECK ("state" IN ('draft', 'in_review', 'published', 'retired')),
    CONSTRAINT "sd_kb_articles_published_check" CHECK ("state" <> 'published' OR "published_version" IS NOT NULL),
    CONSTRAINT "sd_kb_articles_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "sd_kb_articles_expiry_check" CHECK ("expiry_action" IN ('flag', 'hide') AND ("expires_at" IS NULL OR "publish_at" IS NULL OR "expires_at" > "publish_at"))
);
CREATE INDEX "sd_kb_articles_search_idx" ON "sd_kb_articles" USING gin ("search");
CREATE INDEX "sd_kb_articles_space_idx" ON "sd_kb_articles"("organization_id", "space_id", "state");
-- Rows are removed only by the recycle-bin purge (after the restore window, audited).
REVOKE TRUNCATE ON TABLE "sd_kb_articles" FROM app_runtime;

-- Every edit is a new version (§5.2). An author submits a version for review; someone else with desk.kb.publish
-- approves and publishes it (four eyes). A published version never changes.
CREATE TABLE "sd_kb_article_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(300),
    "body_html" TEXT NOT NULL,
    "note" VARCHAR(300),
    "author_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(300),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_article_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_article_versions_key" UNIQUE ("organization_id", "article_id", "version"),
    CONSTRAINT "sd_kb_article_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_article_versions_article_fkey" FOREIGN KEY ("organization_id", "article_id") REFERENCES "sd_kb_articles"("organization_id", "id"),
    CONSTRAINT "sd_kb_article_versions_author_fkey" FOREIGN KEY ("organization_id", "author_user_id") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_kb_article_versions_reviewer_fkey" FOREIGN KEY ("organization_id", "reviewed_by") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_kb_article_versions_four_eyes_check" CHECK ("reviewed_by" IS NULL OR "reviewed_by" <> "author_user_id"),
    CONSTRAINT "sd_kb_article_versions_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 200)
);
REVOKE TRUNCATE ON TABLE "sd_kb_article_versions" FROM app_runtime;
CREATE FUNCTION sd_kb_versions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL OR NEW.article_id <> OLD.article_id OR NEW.version <> OLD.version OR NEW.author_user_id <> OLD.author_user_id THEN
    RAISE EXCEPTION 'a published version never changes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_kb_versions_guard BEFORE UPDATE ON "sd_kb_article_versions" FOR EACH ROW EXECUTE FUNCTION sd_kb_versions_guard();

-- US-G-215: an article's earlier addresses answer with a permanent redirect to the current one.
CREATE TABLE "sd_kb_slug_history" (
    "organization_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "language" VARCHAR(2) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "article_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_slug_history_pkey" PRIMARY KEY ("organization_id", "space_id", "language", "slug"),
    CONSTRAINT "sd_kb_slug_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_slug_history_article_fkey" FOREIGN KEY ("organization_id", "article_id") REFERENCES "sd_kb_articles"("organization_id", "id")
);

-- US-G-025: reusable blocks ({{block:key}} in an article shows the block's current text) and article templates.
CREATE TABLE "sd_kb_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "body_html" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_blocks_key_key" UNIQUE ("organization_id", "key"),
    CONSTRAINT "sd_kb_blocks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_blocks_key_check" CHECK ("key" ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
    CONSTRAINT "sd_kb_blocks_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_kb_blocks" FROM app_runtime;

CREATE TABLE "sd_kb_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "body_html" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_templates_name_key" UNIQUE ("organization_id", "name"),
    CONSTRAINT "sd_kb_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_templates_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100)
);

-- US-G-023: articles linked in a reply, and the one that solved the ticket (reuse count). One row per kind per ticket.
CREATE TABLE "sd_kb_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_links_key" UNIQUE ("organization_id", "article_id", "ticket_id", "kind"),
    CONSTRAINT "sd_kb_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_links_article_fkey" FOREIGN KEY ("organization_id", "article_id") REFERENCES "sd_kb_articles"("organization_id", "id"),
    CONSTRAINT "sd_kb_links_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_kb_links_kind_check" CHECK ("kind" IN ('linked', 'solved'))
);
CREATE UNIQUE INDEX "sd_kb_links_one_solved_key" ON "sd_kb_links"("organization_id", "ticket_id") WHERE "kind" = 'solved';
REVOKE UPDATE, TRUNCATE ON TABLE "sd_kb_links" FROM app_runtime;

-- "Was this helpful?" (US-B-105). person_id is empty for anonymous readers of the public help centre.
CREATE TABLE "sd_kb_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "person_id" UUID,
    "helpful" BOOLEAN NOT NULL,
    "comment" VARCHAR(500),
    "source" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_feedback_article_fkey" FOREIGN KEY ("organization_id", "article_id") REFERENCES "sd_kb_articles"("organization_id", "id"),
    CONSTRAINT "sd_kb_feedback_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_kb_feedback_source_check" CHECK ("source" IN ('help', 'portal', 'public', 'drawer', 'agent'))
);
CREATE UNIQUE INDEX "sd_kb_feedback_once_key" ON "sd_kb_feedback"("organization_id", "article_id", "person_id") WHERE "person_id" IS NOT NULL;
REVOKE UPDATE, TRUNCATE ON TABLE "sd_kb_feedback" FROM app_runtime;

-- Self-service counts (US-G-024, US-G-223, YX-GRO-07): searches (with personal data masked), article views, "this solved
-- it" and "I still need help". Never a user, person or tenant-of-the-reader id: only counts per space.
CREATE TABLE "sd_kb_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "space_id" UUID,
    "kind" VARCHAR(8) NOT NULL,
    "article_id" UUID,
    "query" VARCHAR(200),
    "results" SMALLINT,
    "source" VARCHAR(8) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_kb_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_events_space_fkey" FOREIGN KEY ("organization_id", "space_id") REFERENCES "sd_kb_spaces"("organization_id", "id"),
    CONSTRAINT "sd_kb_events_article_fkey" FOREIGN KEY ("organization_id", "article_id") REFERENCES "sd_kb_articles"("organization_id", "id"),
    CONSTRAINT "sd_kb_events_kind_check" CHECK ("kind" IN ('search', 'view', 'click', 'solved', 'raised')),
    CONSTRAINT "sd_kb_events_source_check" CHECK ("source" IN ('help', 'portal', 'public', 'drawer', 'agent', 'email'))
);
CREATE INDEX "sd_kb_events_report_idx" ON "sd_kb_events"("organization_id", "created_at", "kind");
REVOKE UPDATE, TRUNCATE ON TABLE "sd_kb_events" FROM app_runtime;

-- US-G-216: colleagues follow an article and are told when a new version is published.
CREATE TABLE "sd_kb_follows" (
    "organization_id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kb_follows_pkey" PRIMARY KEY ("organization_id", "article_id", "user_id"),
    CONSTRAINT "sd_kb_follows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kb_follows_article_fkey" FOREIGN KEY ("organization_id", "article_id") REFERENCES "sd_kb_articles"("organization_id", "id"),
    CONSTRAINT "sd_kb_follows_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE
);

-- The article copies its space's audience (insert and every change of the space), and its updated_at moves.
CREATE FUNCTION sd_kb_articles_copy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT s.audience INTO NEW.audience FROM sd_kb_spaces s WHERE s.organization_id = NEW.organization_id AND s.id = NEW.space_id;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER sd_kb_articles_copy BEFORE INSERT OR UPDATE ON "sd_kb_articles" FOR EACH ROW EXECUTE FUNCTION sd_kb_articles_copy();
CREATE FUNCTION sd_kb_spaces_sync() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.audience IS DISTINCT FROM OLD.audience THEN
    UPDATE sd_kb_articles SET audience = NEW.audience WHERE organization_id = NEW.organization_id AND space_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_kb_spaces_sync AFTER UPDATE OF "audience" ON "sd_kb_spaces" FOR EACH ROW EXECUTE FUNCTION sd_kb_spaces_sync();

-- ---------------------------------------------------------------------------------------------
-- SD-1.26 CSAT and NPS (US-B-108, US-B-109). D9: no tracking pixels and no open tracking; a person rates through a
-- single-use link (a random token kept only as its sha256) or in the app.
CREATE TABLE "sd_ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    -- The assignee when the ticket was solved (CSAT per agent).
    "agent_user_id" UUID,
    "group_id" UUID,
    "score" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "channel" VARCHAR(6) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_ratings_ticket_key" UNIQUE ("organization_id", "ticket_id"),
    CONSTRAINT "sd_ratings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_ratings_ticket_fkey" FOREIGN KEY ("organization_id", "desk_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "desk_id", "id"),
    CONSTRAINT "sd_ratings_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_ratings_score_check" CHECK ("score" BETWEEN 1 AND 5),
    CONSTRAINT "sd_ratings_channel_check" CHECK ("channel" IN ('email', 'app', 'portal'))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_ratings" FROM app_runtime;
ALTER TABLE "sd_tickets" ADD COLUMN "rating_asked_at" TIMESTAMPTZ(3);

-- NPS on a schedule: a person gets at most one survey in period_days (US-B-109).
CREATE TABLE "sd_surveys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "every_days" SMALLINT NOT NULL DEFAULT 90,
    "period_days" SMALLINT NOT NULL DEFAULT 90,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_run_at" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_surveys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_surveys_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_surveys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_surveys_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_surveys_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100 AND char_length(btrim("question")) BETWEEN 1 AND 300),
    CONSTRAINT "sd_surveys_days_check" CHECK ("every_days" BETWEEN 7 AND 366 AND "period_days" BETWEEN 7 AND 366)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_surveys" FROM app_runtime;

CREATE TABLE "sd_survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "account_id" UUID,
    "score" SMALLINT NOT NULL,
    "comment" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_survey_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_survey_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_survey_responses_survey_fkey" FOREIGN KEY ("organization_id", "survey_id") REFERENCES "sd_surveys"("organization_id", "id"),
    CONSTRAINT "sd_survey_responses_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_survey_responses_account_fkey" FOREIGN KEY ("organization_id", "account_id") REFERENCES "sd_customer_accounts"("organization_id", "id"),
    CONSTRAINT "sd_survey_responses_score_check" CHECK ("score" BETWEEN 0 AND 10)
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_survey_responses" FROM app_runtime;

-- One link per ask. used_at is set once, by the request that wins (single use); 30 days to answer.
CREATE TABLE "sd_survey_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(4) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "ticket_id" UUID,
    "survey_id" UUID,
    "person_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_survey_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_survey_tokens_hash_key" UNIQUE ("organization_id", "token_hash"),
    CONSTRAINT "sd_survey_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_survey_tokens_ticket_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_survey_tokens_survey_fkey" FOREIGN KEY ("organization_id", "survey_id") REFERENCES "sd_surveys"("organization_id", "id"),
    CONSTRAINT "sd_survey_tokens_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_survey_tokens_kind_check" CHECK (("kind" = 'csat' AND "ticket_id" IS NOT NULL) OR ("kind" = 'nps' AND "survey_id" IS NOT NULL))
);
CREATE INDEX "sd_survey_tokens_person_idx" ON "sd_survey_tokens"("organization_id", "person_id", "kind", "created_at");
REVOKE DELETE, TRUNCATE ON TABLE "sd_survey_tokens" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-1.27 reports (US-B-110, US-B-111, US-G-026 … US-G-028, US-G-223).
-- Daily KPI snapshots per desk, written once a day from day one (they cannot be rebuilt later).
CREATE TABLE "sd_kpi_daily" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "metric" VARCHAR(24) NOT NULL,
    "value" NUMERIC(12, 2) NOT NULL,
    "target" NUMERIC(12, 2),
    "rag" VARCHAR(5),

    CONSTRAINT "sd_kpi_daily_pkey" PRIMARY KEY ("organization_id", "desk_id", "day", "metric"),
    CONSTRAINT "sd_kpi_daily_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kpi_daily_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_kpi_daily_rag_check" CHECK ("rag" IS NULL OR "rag" IN ('green', 'amber', 'red'))
);
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "sd_kpi_daily" FROM app_runtime;

-- A KPI's target and its amber limit; past the amber limit is red. higher_is_better decides the direction.
CREATE TABLE "sd_kpi_targets" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "metric" VARCHAR(24) NOT NULL,
    "target" NUMERIC(12, 2) NOT NULL,
    "amber" NUMERIC(12, 2) NOT NULL,
    "higher_is_better" BOOLEAN NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_kpi_targets_pkey" PRIMARY KEY ("organization_id", "desk_id", "metric"),
    CONSTRAINT "sd_kpi_targets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_kpi_targets_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id"),
    CONSTRAINT "sd_kpi_targets_order_check" CHECK (CASE WHEN "higher_is_better" THEN "amber" <= "target" ELSE "amber" >= "target" END)
);

-- A custom report: chosen columns and filters over the ticket list (US-B-111). Columns and filters are checked against
-- an allow-list by the API; rows are always the runner's own visible tickets.
CREATE TABLE "sd_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "columns" TEXT[] NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_reports_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_reports_owner_fkey" FOREIGN KEY ("organization_id", "owner_user_id") REFERENCES "users"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_reports_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_reports_columns_check" CHECK (cardinality("columns") BETWEEN 1 AND 20),
    CONSTRAINT "sd_reports_filters_check" CHECK (jsonb_typeof("filters") = 'object')
);

-- Emailed reports: each recipient's own rights decide what their copy holds (US-B-111).
CREATE TABLE "sd_report_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "frequency" VARCHAR(8) NOT NULL,
    "recipients" UUID[] NOT NULL,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "last_run_at" TIMESTAMPTZ(3),
    "last_result" VARCHAR(300),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_report_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_report_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_report_schedules_report_fkey" FOREIGN KEY ("organization_id", "report_id") REFERENCES "sd_reports"("organization_id", "id") ON DELETE CASCADE,
    CONSTRAINT "sd_report_schedules_frequency_check" CHECK ("frequency" IN ('daily', 'weekly', 'monthly')),
    CONSTRAINT "sd_report_schedules_recipients_check" CHECK (cardinality("recipients") BETWEEN 1 AND 20)
);

-- US-G-028 wall screens: a view-only link (token kept as sha256) that shows counts and SLA, never ticket text.
CREATE TABLE "sd_wallboards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "desk_ids" UUID[] NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    -- Tell the desk's leads when the open queue goes above this many tickets.
    "backlog_alert" INTEGER,
    "last_alert_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_wallboards_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_wallboards_token_key" UNIQUE ("organization_id", "token_hash"),
    CONSTRAINT "sd_wallboards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_wallboards_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_wallboards_desks_check" CHECK (cardinality("desk_ids") BETWEEN 1 AND 10),
    CONSTRAINT "sd_wallboards_alert_check" CHECK ("backlog_alert" IS NULL OR "backlog_alert" > 0)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_wallboards" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-1.29 standalone (US-B-121, US-G-032): directory sync. LDAP: the bind password is inside config_encrypted
-- (org-secrets key). SCIM: the bearer token is kept only as its sha256 and works only on this source's /scim routes.
CREATE TABLE "sd_directory_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(4) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "config_encrypted" TEXT,
    "scim_token_hash" CHAR(64),
    -- [{ group, deskId, role }]: members of a directory group get that seat on that desk (existing YukthiX logins).
    "group_map" JSONB NOT NULL DEFAULT '[]',
    "schedule" VARCHAR(6) NOT NULL DEFAULT 'daily',
    "status" VARCHAR(8) NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMPTZ(3),
    "last_result" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_directory_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_directory_sources_org_id_key" UNIQUE ("organization_id", "id"),
    CONSTRAINT "sd_directory_sources_scim_key" UNIQUE ("organization_id", "scim_token_hash"),
    CONSTRAINT "sd_directory_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_directory_sources_kind_check" CHECK (("kind" = 'ldap' AND "config_encrypted" IS NOT NULL) OR ("kind" = 'scim' AND "scim_token_hash" IS NOT NULL)),
    CONSTRAINT "sd_directory_sources_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 100),
    CONSTRAINT "sd_directory_sources_map_check" CHECK (jsonb_typeof("group_map") = 'array' AND jsonb_array_length("group_map") <= 50),
    CONSTRAINT "sd_directory_sources_schedule_check" CHECK ("schedule" IN ('hourly', 'daily', 'off')),
    CONSTRAINT "sd_directory_sources_status_check" CHECK ("status" IN ('active', 'paused', 'error'))
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_directory_sources" FROM app_runtime;

-- One directory user as this source knows them; the person is the P01 person (light people list).
CREATE TABLE "sd_directory_people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "external_id" VARCHAR(200) NOT NULL,
    "user_name" CITEXT NOT NULL,
    "person_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "groups" TEXT[] NOT NULL DEFAULT '{}',
    "department" VARCHAR(100),
    "manager_external_id" VARCHAR(200),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_directory_people_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_directory_people_external_key" UNIQUE ("organization_id", "source_id", "external_id"),
    CONSTRAINT "sd_directory_people_user_key" UNIQUE ("organization_id", "source_id", "user_name"),
    CONSTRAINT "sd_directory_people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_directory_people_source_fkey" FOREIGN KEY ("organization_id", "source_id") REFERENCES "sd_directory_sources"("organization_id", "id"),
    CONSTRAINT "sd_directory_people_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_directory_people_groups_check" CHECK (cardinality("groups") <= 200)
);
REVOKE DELETE, TRUNCATE ON TABLE "sd_directory_people" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- SD-1.30 privacy (US-B-115, US-G-218, §14.5).
CREATE TABLE "sd_privacy_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "source" VARCHAR(6) NOT NULL,
    "note" VARCHAR(500),
    "status" VARCHAR(8) NOT NULL DEFAULT 'open',
    "decided_by" UUID,
    "decision_note" VARCHAR(500),
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_privacy_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_privacy_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_privacy_requests_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_privacy_requests_decider_fkey" FOREIGN KEY ("organization_id", "decided_by") REFERENCES "users"("organization_id", "id"),
    CONSTRAINT "sd_privacy_requests_kind_check" CHECK ("kind" IN ('access', 'erasure')),
    CONSTRAINT "sd_privacy_requests_source_check" CHECK ("source" IN ('app', 'portal')),
    CONSTRAINT "sd_privacy_requests_status_check" CHECK ("status" IN ('open', 'done', 'refused'))
);
-- One open request of a kind per person.
CREATE UNIQUE INDEX "sd_privacy_requests_open_key" ON "sd_privacy_requests"("organization_id", "person_id", "kind") WHERE "status" = 'open';
REVOKE DELETE, TRUNCATE ON TABLE "sd_privacy_requests" FROM app_runtime;

-- The company's desk retention and legal hold (P14 YX-TEN-04): closed tickets' words and files are removed after
-- retention_months; nothing is removed while legal_hold is on. bin_days: how long deleted things can be restored.
CREATE TABLE "sd_privacy_settings" (
    "organization_id" UUID NOT NULL,
    "retention_months" SMALLINT,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "bin_days" SMALLINT NOT NULL DEFAULT 30,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_privacy_settings_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "sd_privacy_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_privacy_settings_retention_check" CHECK ("retention_months" IS NULL OR "retention_months" BETWEEN 6 AND 240),
    CONSTRAINT "sd_privacy_settings_bin_check" CHECK ("bin_days" BETWEEN 1 AND 90)
);
ALTER TABLE "sd_tickets" ADD COLUMN "content_removed_at" TIMESTAMPTZ(3);

-- US-G-218 recycle bin: a deleted article, saved view, saved reply, scenario or email rule is kept here as it was and
-- can be put back until purge_after; then the retention job removes it (audited). Tickets are never here (YX-SD-19).
CREATE TABLE "sd_recycle_bin" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "entity_id" UUID NOT NULL,
    "desk_id" UUID,
    "label" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL,
    "deleted_by" UUID,
    "deleted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purge_after" TIMESTAMPTZ(3) NOT NULL,
    "restored_at" TIMESTAMPTZ(3),

    CONSTRAINT "sd_recycle_bin_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_recycle_bin_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_recycle_bin_kind_check" CHECK ("kind" IN ('kb_article', 'view', 'canned_response', 'scenario', 'email_rule'))
);
CREATE INDEX "sd_recycle_bin_idx" ON "sd_recycle_bin"("organization_id", "deleted_at");

-- ---------------------------------------------------------------------------------------------
-- SD-1.31 YukthiX's own support (§3 use 2, US-B-116 … US-B-120).
-- The platform tenant: YukthiX's own company, where the YukthiX Support desk lives. Exactly one, slug yukthix, and
-- once marked it stays marked (go-live: create it before sign-ups open; GO-LIVE-CHECKLIST).
ALTER TABLE "organizations" ADD COLUMN "is_platform" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_platform_check" CHECK (NOT "is_platform" OR "slug" = 'yukthix');
CREATE UNIQUE INDEX "organizations_one_platform_key" ON "organizations"("is_platform") WHERE "is_platform";
CREATE FUNCTION organizations_platform_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_platform AND (NOT NEW.is_platform OR NEW.slug IS DISTINCT FROM OLD.slug) THEN
    RAISE EXCEPTION 'the YukthiX platform company stays the platform company' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organizations_platform_guard BEFORE UPDATE ON "organizations" FOR EACH ROW EXECUTE FUNCTION organizations_platform_guard();

-- A customer account in the platform tenant can stand for one customer company (its tenant). Only there.
ALTER TABLE "sd_customer_accounts" ADD COLUMN "linked_tenant_id" UUID REFERENCES "organizations"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX "sd_customer_accounts_tenant_key" ON "sd_customer_accounts"("organization_id", "linked_tenant_id") WHERE "linked_tenant_id" IS NOT NULL;
CREATE FUNCTION sd_customer_accounts_tenant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.linked_tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.organization_id AND o.is_platform) THEN
    RAISE EXCEPTION 'only YukthiX''s own support links an account to a company' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.linked_tenant_id = NEW.organization_id THEN
    RAISE EXCEPTION 'an account cannot link to the platform company itself' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_customer_accounts_tenant_guard BEFORE INSERT OR UPDATE OF "linked_tenant_id" ON "sd_customer_accounts" FOR EACH ROW EXECUTE FUNCTION sd_customer_accounts_tenant_guard();

-- Which desk of the platform tenant takes customers' support tickets (one row, in the platform tenant).
CREATE TABLE "sd_support_bridge" (
    "organization_id" UUID NOT NULL,
    "desk_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_support_bridge_pkey" PRIMARY KEY ("organization_id"),
    CONSTRAINT "sd_support_bridge_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_support_bridge_desk_fkey" FOREIGN KEY ("organization_id", "desk_id") REFERENCES "sd_desks"("organization_id", "id")
);

-- YukthiX staff work the platform desk from the console as a desk user of the platform tenant (never a sign-in of
-- its own: status console_only). The staff account is the org-less super_admin; the link is the only way in.
CREATE TABLE "sd_console_agents" (
    "organization_id" UUID NOT NULL,
    "staff_user_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_console_agents_pkey" PRIMARY KEY ("organization_id", "staff_user_id"),
    CONSTRAINT "sd_console_agents_user_key" UNIQUE ("organization_id", "user_id"),
    CONSTRAINT "sd_console_agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_console_agents_staff_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "sd_console_agents_user_fkey" FOREIGN KEY ("organization_id", "user_id") REFERENCES "users"("organization_id", "id")
);
CREATE FUNCTION sd_console_agents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = NEW.organization_id AND o.is_platform) THEN
    RAISE EXCEPTION 'console agents belong to the platform company' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sd_console_agents_guard BEFORE INSERT OR UPDATE ON "sd_console_agents" FOR EACH ROW EXECUTE FUNCTION sd_console_agents_guard();

-- What a customer company sends to YukthiX support, written only by sd_support_intake() into the platform tenant and
-- turned into a ticket (or a reply) by the platform desk's own processing. The caller never chooses the account: it is
-- the account linked to the caller's own company.
CREATE TABLE "sd_support_intake" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "from_tenant_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "from_name" VARCHAR(200),
    "from_email" CITEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "ticket_id" UUID,
    "subject" VARCHAR(200),
    "body_text" VARCHAR(10000) NOT NULL,
    "severity" SMALLINT NOT NULL DEFAULT 3,
    "screen" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "result_ticket_id" UUID,
    "error" VARCHAR(300),

    CONSTRAINT "sd_support_intake_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_support_intake_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_support_intake_account_fkey" FOREIGN KEY ("organization_id", "account_id") REFERENCES "sd_customer_accounts"("organization_id", "id"),
    CONSTRAINT "sd_support_intake_ticket_fkey" FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "sd_tickets"("organization_id", "id"),
    CONSTRAINT "sd_support_intake_severity_check" CHECK ("severity" BETWEEN 1 AND 4),
    CONSTRAINT "sd_support_intake_shape_check" CHECK (("ticket_id" IS NULL) = ("subject" IS NOT NULL))
);
CREATE INDEX "sd_support_intake_pending_idx" ON "sd_support_intake"("organization_id", "created_at") WHERE "processed_at" IS NULL;
REVOKE DELETE, TRUNCATE ON TABLE "sd_support_intake" FROM app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Later additions to this batch (applied together).
-- A person adds a comment after the one-click rating (the score itself never changes).
GRANT UPDATE ("comment") ON TABLE "sd_ratings", "sd_survey_responses" TO app_runtime;

-- SCIM groups pushed by the company's identity provider (members are kept on sd_directory_people.groups by name).
CREATE TABLE "sd_directory_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "external_id" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_directory_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sd_directory_groups_name_key" UNIQUE ("organization_id", "source_id", "display_name"),
    CONSTRAINT "sd_directory_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_directory_groups_source_fkey" FOREIGN KEY ("organization_id", "source_id") REFERENCES "sd_directory_sources"("organization_id", "id")
);

-- The light people list of a company that uses only the Service Desk (US-B-121): team and location of a P01 person.
-- When the company adds YukthiX HR, the same persons become employees (nothing moves).
CREATE TABLE "sd_people" (
    "organization_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "team" VARCHAR(100),
    "location_id" UUID,
    "source" VARCHAR(6) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sd_people_pkey" PRIMARY KEY ("organization_id", "person_id"),
    CONSTRAINT "sd_people_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sd_people_person_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "persons"("organization_id", "id"),
    CONSTRAINT "sd_people_location_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id"),
    CONSTRAINT "sd_people_source_check" CHECK ("source" IN ('manual', 'csv', 'ldap', 'scim'))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_directory_groups', 'sd_people']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
    EXECUTE format('CREATE POLICY sd_portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

-- US-B-115 / §14.5: an erasure request or the retention job may blank a message's words (never anything else, and only
-- to the fixed "[Removed]" text), inside their own system transaction (app.sd_redact). Every other rule stays.
CREATE OR REPLACE FUNCTION sd_ticket_messages_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ticket_id <> OLD.ticket_id OR NEW.kind <> OLD.kind OR NEW.side <> OLD.side OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
     OR NEW.author_person_id IS DISTINCT FROM OLD.author_person_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'a message keeps its ticket, kind and author' USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('app.sd_redact', true) IS NOT DISTINCT FROM 'on' AND NEW.body_html = '<p>[Removed]</p>' AND NEW.body_text = '[Removed]' THEN
    RETURN NEW;
  END IF;
  IF OLD.kind <> 'note' AND (NEW.body_html <> OLD.body_html OR NEW.body_text <> OLD.body_text OR NEW.mentions <> OLD.mentions) THEN
    RAISE EXCEPTION 'a reply sent to the requester is never edited' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Tenant isolation (YX-ORG-14, §5.1).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_kb_spaces', 'sd_kb_categories', 'sd_kb_articles', 'sd_kb_article_versions', 'sd_kb_slug_history',
    'sd_kb_blocks', 'sd_kb_templates', 'sd_kb_links', 'sd_kb_feedback', 'sd_kb_events', 'sd_kb_follows', 'sd_ratings', 'sd_surveys',
    'sd_survey_responses', 'sd_survey_tokens', 'sd_kpi_daily', 'sd_kpi_targets', 'sd_reports', 'sd_report_schedules', 'sd_wallboards',
    'sd_directory_sources', 'sd_directory_people', 'sd_privacy_requests', 'sd_privacy_settings', 'sd_recycle_bin',
    'sd_support_bridge', 'sd_console_agents', 'sd_support_intake']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))
         WITH CHECK (organization_id = (SELECT app_current_org()) OR (SELECT app_is_super_admin()))',
      t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Readers of the knowledge base in SQL (§14.1, "checked in SQL and in the service"). An outside requester (portal
-- session) and the API's requester and public reads (app.kb_reader = 'requester' / 'public', set in their own
-- transaction) see only published articles of a requester or public audience (public reads: public only); never
-- drafts, versions, internal links or feedback.
CREATE FUNCTION sd_kb_reader() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN app_portal_person() IS NOT NULL THEN 'requester' ELSE NULLIF(current_setting('app.kb_reader', true), '') END
$$;
CREATE POLICY sd_kb_reader_scope ON "sd_kb_articles" AS RESTRICTIVE FOR SELECT
  USING (sd_kb_reader() IS NULL OR ("state" = 'published' AND "audience" = ANY (CASE sd_kb_reader() WHEN 'public' THEN ARRAY['public'] ELSE ARRAY['requesters', 'public'] END)));
CREATE POLICY sd_kb_reader_scope ON "sd_kb_spaces" AS RESTRICTIVE FOR SELECT
  USING (sd_kb_reader() IS NULL OR ("status" = 'active' AND "audience" = ANY (CASE sd_kb_reader() WHEN 'public' THEN ARRAY['public'] ELSE ARRAY['requesters', 'public'] END)));
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sd_kb_article_versions', 'sd_kb_links', 'sd_kb_feedback', 'sd_kb_follows', 'sd_kb_templates']
  LOOP
    EXECUTE format('CREATE POLICY sd_kb_reader_none ON %I AS RESTRICTIVE FOR SELECT USING (sd_kb_reader() IS NULL)', t);
  END LOOP;
  -- Nothing internal is ever read through a portal session.
  FOREACH t IN ARRAY ARRAY['sd_ratings', 'sd_surveys', 'sd_survey_responses', 'sd_kpi_daily', 'sd_kpi_targets', 'sd_reports',
    'sd_report_schedules', 'sd_wallboards', 'sd_directory_sources', 'sd_directory_people', 'sd_recycle_bin', 'sd_console_agents',
    'sd_support_intake', 'sd_support_bridge', 'sd_privacy_settings']
  LOOP
    EXECUTE format('CREATE POLICY sd_portal_none ON %I AS RESTRICTIVE FOR SELECT USING (app_portal_person() IS NULL)', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- The two bridge functions (§3 use 2, §14.1). They are the ONLY way a customer company's session reaches the platform
-- tenant. Each runs as the schema owner, takes only the fields it needs, works out the caller's company and login from
-- the caller's own transaction (app.current_org, app.current_user_id: set by the API from the session, never from the
-- request body), switches the transaction to the platform tenant for its own work and switches back before it returns.
-- An error aborts the caller's transaction, which also undoes the switch.
CREATE FUNCTION sd_support_enter(OUT caller_org uuid, OUT caller_user uuid, OUT platform_org uuid, OUT account uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  caller_org := app_current_org();
  caller_user := app_current_user_id();
  IF caller_org IS NULL OR caller_user IS NULL OR app_is_super_admin() OR app_portal_person() IS NOT NULL
     OR NULLIF(current_setting('app.support_session', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'SD_SUPPORT_CALLER: sign in to your company to contact YukthiX' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT o.id INTO platform_org FROM organizations o WHERE o.is_platform;
  IF platform_org IS NULL OR platform_org = caller_org THEN
    RAISE EXCEPTION 'SD_SUPPORT_UNAVAILABLE: YukthiX support is not set up here' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM set_config('app.current_org', platform_org::text, true);
  PERFORM set_config('app.current_user_id', '', true);
  PERFORM set_config('app.sd_system', 'on', true);
  SELECT a.id INTO account FROM sd_customer_accounts a WHERE a.organization_id = platform_org AND a.linked_tenant_id = caller_org AND a.status = 'active';
END $$;
CREATE FUNCTION sd_support_leave(p_org uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('app.current_org', p_org::text, true);
  PERFORM set_config('app.current_user_id', p_user::text, true);
  PERFORM set_config('app.sd_system', '', true);
END $$;
-- The enter / leave helpers are not callable by the app on their own.
REVOKE ALL ON FUNCTION sd_support_enter() FROM PUBLIC;
REVOKE ALL ON FUNCTION sd_support_leave(uuid, uuid) FROM PUBLIC;

-- New ticket (p_ticket NULL, with a subject) or a reply on one of the caller company's own tickets (p_ticket).
-- Returns the intake id; the platform desk turns it into the ticket or the reply.
CREATE FUNCTION sd_support_intake(p_subject text, p_body text, p_severity integer, p_ticket uuid DEFAULT NULL, p_screen text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  v_name text;
  v_email text;
  v_status text;
  v_id uuid;
BEGIN
  IF p_body IS NULL OR char_length(btrim(p_body)) = 0 OR char_length(p_body) > 10000 THEN
    RAISE EXCEPTION 'SD_SUPPORT_INPUT: describe the problem (up to 10,000 characters)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_ticket IS NULL AND (p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'SD_SUPPORT_INPUT: give a short subject (up to 200 characters)' USING ERRCODE = 'check_violation';
  END IF;
  IF p_severity IS NULL OR p_severity NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'SD_SUPPORT_INPUT: severity is 1 to 4' USING ERRCODE = 'check_violation';
  END IF;
  -- The caller's own login, read in the caller's own company before the switch.
  SELECT u.name, u.email::text, u.status INTO v_name, v_email, v_status FROM users u
   WHERE u.organization_id = app_current_org() AND u.id = app_current_user_id();
  IF v_email IS NULL OR v_status <> 'active' THEN
    RAISE EXCEPTION 'SD_SUPPORT_CALLER: sign in to your company to contact YukthiX' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO c FROM sd_support_enter();
  IF c.account IS NULL THEN
    PERFORM sd_support_leave(c.caller_org, c.caller_user);
    RAISE EXCEPTION 'SD_SUPPORT_UNAVAILABLE: your company is not linked to YukthiX support yet' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF p_ticket IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM sd_tickets t JOIN sd_support_bridge b ON b.organization_id = t.organization_id AND b.desk_id = t.desk_id
       WHERE t.organization_id = c.platform_org AND t.id = p_ticket AND t.customer_account_id = c.account AND t.merged_into_id IS NULL) THEN
    PERFORM sd_support_leave(c.caller_org, c.caller_user);
    RAISE EXCEPTION 'SD_SUPPORT_NOT_FOUND: no such ticket' USING ERRCODE = 'no_data_found';
  END IF;
  INSERT INTO sd_support_intake (organization_id, from_tenant_id, from_user_id, from_name, from_email, account_id, ticket_id, subject, body_text, severity, screen)
  VALUES (c.platform_org, c.caller_org, c.caller_user, left(v_name, 200), v_email, c.account, p_ticket,
          CASE WHEN p_ticket IS NULL THEN btrim(p_subject) END, p_body, p_severity, left(p_screen, 200))
  RETURNING id INTO v_id;
  PERFORM sd_support_leave(c.caller_org, c.caller_user);
  RETURN v_id;
END $$;

-- The caller company's tickets with YukthiX support (p_ticket NULL), or one of them with its conversation: replies and
-- system messages only, never internal notes; agents by first name. Nothing else of the platform tenant is returned.
CREATE FUNCTION sd_support_my_tickets(p_ticket uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c record;
  v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.organization_id = app_current_org() AND u.id = app_current_user_id() AND u.status = 'active') THEN
    RAISE EXCEPTION 'SD_SUPPORT_CALLER: sign in to your company to contact YukthiX' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO c FROM sd_support_enter();
  IF c.account IS NULL THEN
    PERFORM sd_support_leave(c.caller_org, c.caller_user);
    RETURN '[]'::jsonb;
  END IF;
  IF p_ticket IS NULL THEN
    SELECT coalesce(jsonb_agg(x ORDER BY x.updated_at DESC), '[]'::jsonb) INTO v FROM (
      SELECT t.id, t.number, t.subject, s.label AS status, t.system_state AS state, t.priority AS severity, t.created_at, t.updated_at
      FROM sd_tickets t
      JOIN sd_support_bridge b ON b.organization_id = t.organization_id AND b.desk_id = t.desk_id
      JOIN sd_statuses s ON s.organization_id = t.organization_id AND s.id = t.status_id
      WHERE t.organization_id = c.platform_org AND t.customer_account_id = c.account
      ORDER BY t.updated_at DESC LIMIT 200) x;
    -- Sent but not yet a ticket (the platform desk picks it up within seconds).
    v := v || coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'number', NULL, 'subject', i.subject, 'status', 'Sending', 'state', 'new', 'severity', i.severity, 'created_at', i.created_at, 'updated_at', i.created_at))
                        FROM sd_support_intake i WHERE i.organization_id = c.platform_org AND i.account_id = c.account AND i.processed_at IS NULL AND i.ticket_id IS NULL), '[]'::jsonb);
  ELSE
    SELECT jsonb_build_object(
      'id', t.id, 'number', t.number, 'subject', t.subject, 'status', s.label, 'state', t.system_state, 'severity', t.priority,
      'tier', t.plan_tier, 'created_at', t.created_at, 'updated_at', t.updated_at,
      'messages', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', m.id, 'side', m.side, 'at', m.created_at, 'body_html', m.body_html,
                 'author', CASE WHEN m.side = 'agent' THEN coalesce(NULLIF(split_part(btrim(u.name), ' ', 1), ''), 'YukthiX') WHEN m.kind = 'system' THEN 'YukthiX' ELSE coalesce(btrim(concat_ws(' ', p.given_name, p.family_name)), '') END)
                 ORDER BY m.created_at)
        FROM sd_ticket_messages m
        LEFT JOIN users u ON u.organization_id = m.organization_id AND u.id = m.author_user_id
        LEFT JOIN persons p ON p.organization_id = m.organization_id AND p.id = m.author_person_id
        WHERE m.organization_id = t.organization_id AND m.ticket_id = t.id AND m.kind IN ('reply', 'system')), '[]'::jsonb))
    INTO v
    FROM sd_tickets t
    JOIN sd_support_bridge b ON b.organization_id = t.organization_id AND b.desk_id = t.desk_id
    JOIN sd_statuses s ON s.organization_id = t.organization_id AND s.id = t.status_id
    WHERE t.organization_id = c.platform_org AND t.id = p_ticket AND t.customer_account_id = c.account;
  END IF;
  PERFORM sd_support_leave(c.caller_org, c.caller_user);
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION sd_support_intake(text, text, integer, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION sd_support_my_tickets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sd_support_intake(text, text, integer, uuid, text) TO app_runtime;
GRANT EXECUTE ON FUNCTION sd_support_my_tickets(uuid) TO app_runtime;

-- ---------------------------------------------------------------------------------------------
-- Permission keys. desk.survey.manage is in the 3b-2 list; NPS needs it now. Contacting YukthiX support is the
-- company's System Admin's; working the YukthiX Support desk from the console is a staff key (never assignable).
INSERT INTO "permissions" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'desk.survey.manage', 'Set up NPS surveys and see their answers'),
  (gen_random_uuid(), 'org.yukthix_support.raise', 'Contact YukthiX support for the company and follow its tickets'),
  (gen_random_uuid(), 'platform.support_desk.work', 'Work the YukthiX Support desk in the console (YukthiX staff)')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'org_admin', "id" FROM "permissions" WHERE "key" IN ('org.yukthix_support.raise', 'desk.directory.manage', 'desk.kb.author', 'desk.kb.publish', 'desk.report.view', 'desk.report.manage', 'desk.survey.manage')
ON CONFLICT DO NOTHING;
INSERT INTO "role_permissions" ("role", "permission_id")
SELECT 'super_admin', "id" FROM "permissions" WHERE "key" = 'platform.support_desk.work'
ON CONFLICT DO NOTHING;
