-- CreateTable
CREATE TABLE [dbo].[candidate_profiles] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [resume_path] NVARCHAR(1000),
    [parse_status] NVARCHAR(1000) NOT NULL CONSTRAINT [candidate_profiles_parse_status_df] DEFAULT 'pending',
    [parsed_summary] NVARCHAR(MAX),
    [parsed_skills] NVARCHAR(MAX),
    [parsed_title] NVARCHAR(1000),
    [parsed_years_experience] INT,
    [parsed_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_profiles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_profiles_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [candidate_profiles_candidate_id_key] ON [dbo].[candidate_profiles]([candidate_id]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_profiles] ADD CONSTRAINT [candidate_profiles_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AlterTable: jobs -- add public-apply fields
ALTER TABLE [dbo].[jobs] ADD [public_apply_enabled] BIT NOT NULL CONSTRAINT [jobs_public_apply_enabled_df] DEFAULT 0, [apply_token] NVARCHAR(1000);

-- CreateIndex
-- Filtered unique index: apply_token is nullable, and a plain unique index rejects
-- multiple NULLs on SQL Server. Every job without public apply enabled has a NULL
-- apply_token, so the index must only enforce uniqueness where the value is set.
-- Wrapped in EXEC(): Prisma's SQL Server migration runner sends this whole file as one
-- batch (it does not understand `GO`, which is a sqlcmd/SSMS-only convention -- verified:
-- adding GO here failed with "Incorrect syntax near 'GO'", error 102), and SQL Server
-- can't resolve a column added by ALTER TABLE ADD against a later statement in that same
-- batch (verified: without EXEC, this failed with "Invalid column name 'apply_token'",
-- error 207). Dynamic SQL defers parsing of the CREATE INDEX until runtime, after the
-- preceding ALTER TABLE has already committed the column.
EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [jobs_apply_token_key] ON [dbo].[jobs]([apply_token]) WHERE [apply_token] IS NOT NULL');

-- AlterTable: pipeline_entries -- add application token for public-apply flow
ALTER TABLE [dbo].[pipeline_entries] ADD [application_token] NVARCHAR(1000);

-- CreateIndex
-- Same filtered-unique reasoning and same-batch constraint as jobs.apply_token above.
EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [pipeline_entries_application_token_key] ON [dbo].[pipeline_entries]([application_token]) WHERE [application_token] IS NOT NULL');

-- NOTE: the tenant RLS policy extension for dbo.candidate_profiles lives in the
-- follow-up migration 20260819090001_candidate_experience_rls, not here. SQL Server
-- cannot resolve ALTER SECURITY POLICY ... ON dbo.candidate_profiles in the same batch
-- as the CREATE TABLE that defines dbo.candidate_profiles (same constraint documented in
-- 20260818090000_ats_pipeline). jobs and pipeline_entries already have RLS policies from
-- that earlier migration, so only candidate_profiles needs new predicates.
