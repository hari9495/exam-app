-- CreateTable
CREATE TABLE [dbo].[setup_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [setup_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [setup_tokens_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [setup_tokens_token_hash_key] ON [dbo].[setup_tokens]([token_hash]);
