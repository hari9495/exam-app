-- Paid job-board adapters (Zoho backlog): a JobBoard can be a paid push board (LinkedIn /
-- Indeed / generic HTTP) with per-org encrypted API creds, alongside the existing free XML-feed
-- boards. Additive columns only, on two tables that are ALREADY RLS-scoped (job_boards,
-- job_board_publications) -- adding columns doesn't change the tenant predicate, so no _rls sibling.

ALTER TABLE [dbo].[job_boards] ADD
    [provider] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_job_boards_provider] DEFAULT 'xml_feed',
    [config_encrypted] NVARCHAR(MAX) NULL;

ALTER TABLE [dbo].[job_board_publications] ADD
    [external_post_id] NVARCHAR(MAX) NULL,
    [post_status] NVARCHAR(1000) NULL,
    [post_error] NVARCHAR(MAX) NULL,
    [posted_at] DATETIME2 NULL;
