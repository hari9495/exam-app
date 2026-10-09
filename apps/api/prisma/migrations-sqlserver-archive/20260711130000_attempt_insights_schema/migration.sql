-- CreateTable
CREATE TABLE [dbo].[attempt_insights] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [summary] NVARCHAR(MAX),
    [generated_at] DATETIME2 NOT NULL CONSTRAINT [attempt_insights_generated_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [attempt_insights_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [attempt_insights_attempt_id_key] ON [dbo].[attempt_insights]([attempt_id]);

-- AddForeignKey
ALTER TABLE [dbo].[attempt_insights] ADD CONSTRAINT [attempt_insights_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
