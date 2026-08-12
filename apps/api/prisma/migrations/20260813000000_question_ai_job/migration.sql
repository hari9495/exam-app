ALTER TABLE [dbo].[questions] ADD [ai_job_id] UNIQUEIDENTIFIER NULL;

ALTER TABLE [dbo].[questions]
  ADD CONSTRAINT [questions_ai_job_id_fkey]
  FOREIGN KEY ([ai_job_id]) REFERENCES [dbo].[ai_jobs]([id])
  ON DELETE SET NULL ON UPDATE CASCADE;
