-- CreateTable
CREATE TABLE [dbo].[ai_credit_usage] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [source] NVARCHAR(1000) NOT NULL,
    [credits] INT NOT NULL,
    [source_id] UNIQUEIDENTIFIER,
    [occurred_at] DATETIME2 NOT NULL CONSTRAINT [ai_credit_usage_occurred_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ai_credit_usage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ai_credit_usage_organization_id_idx] ON [dbo].[ai_credit_usage]([organization_id]);
