-- AlterTable
ALTER TABLE [dbo].[walk_in_groups] ADD [job_id] UNIQUEIDENTIFIER;

-- AddForeignKey + CreateIndex, both EXEC-wrapped.
-- Prisma's SQL Server migration runner sends this whole file as ONE batch (it does not
-- understand `GO`, a sqlcmd/SSMS-only convention). SQL Server cannot resolve [job_id] --
-- added by the ALTER TABLE ADD above -- from a later statement in the same batch, so an
-- un-wrapped FK/INDEX referencing it fails at parse time with "Invalid column name
-- 'job_id'" (error 207). Wrapping in EXEC(N'...') defers parsing until runtime, after the
-- ADD COLUMN has already committed. Same constraint and fix as
-- 20260819090000_candidate_experience (jobs.apply_token / pipeline_entries.application_token).
EXEC(N'ALTER TABLE [dbo].[walk_in_groups] ADD CONSTRAINT [walk_in_groups_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION');

EXEC(N'CREATE NONCLUSTERED INDEX [walk_in_groups_job_id_idx] ON [dbo].[walk_in_groups]([job_id])');
