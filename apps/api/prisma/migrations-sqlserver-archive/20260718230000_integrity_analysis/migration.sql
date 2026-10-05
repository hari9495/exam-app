ALTER TABLE [dbo].[attempts] ADD [consent_at] DATETIME2;
ALTER TABLE [dbo].[answers] ADD [telemetry_json] NVARCHAR(max);

CREATE TABLE [dbo].[integrity_analyses] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [integrity_analyses_id_df] DEFAULT newid(),
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [level] NVARCHAR(1000),
    [flags_json] NVARCHAR(max),
    [narrative] NVARCHAR(max),
    [analyzed_at] DATETIME2 NOT NULL CONSTRAINT [integrity_analyses_analyzed_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [integrity_analyses_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [integrity_analyses_attempt_id_key] UNIQUE NONCLUSTERED ([attempt_id]),
    CONSTRAINT [integrity_analyses_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE
);
