-- AlterTable
ALTER TABLE [dbo].[walk_in_groups] ADD [job_id] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[walk_in_groups] ADD CONSTRAINT [walk_in_groups_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- CreateIndex
CREATE NONCLUSTERED INDEX [walk_in_groups_job_id_idx] ON [dbo].[walk_in_groups]([job_id]);
