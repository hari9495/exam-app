-- CreateTable
CREATE TABLE [dbo].[proctoring_analyses] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [risk_level] NVARCHAR(1000),
    [summary] NVARCHAR(MAX),
    [analyzed_at] DATETIME2 NOT NULL CONSTRAINT [proctoring_analyses_analyzed_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [proctoring_analyses_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [proctoring_analyses_attempt_id_key] ON [dbo].[proctoring_analyses]([attempt_id]);

-- AddForeignKey
ALTER TABLE [dbo].[proctoring_analyses] ADD CONSTRAINT [proctoring_analyses_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
