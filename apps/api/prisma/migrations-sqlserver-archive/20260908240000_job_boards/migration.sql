-- CreateTable
CREATE TABLE [dbo].[job_boards] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [feed_token] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [job_boards_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [job_boards_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [job_boards_feed_token_key] UNIQUE NONCLUSTERED ([feed_token]),
    CONSTRAINT [job_boards_organization_id_name_key] UNIQUE NONCLUSTERED ([organization_id],[name])
);

-- CreateTable
CREATE TABLE [dbo].[job_board_publications] (
    [job_board_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [job_board_publications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [job_board_publications_pkey] PRIMARY KEY CLUSTERED ([job_board_id],[job_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [job_boards_organization_id_idx] ON [dbo].[job_boards]([organization_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [job_board_publications_job_id_idx] ON [dbo].[job_board_publications]([job_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [job_board_publications_organization_id_idx] ON [dbo].[job_board_publications]([organization_id]);

-- AddForeignKey
ALTER TABLE [dbo].[job_board_publications] ADD CONSTRAINT [job_board_publications_job_board_id_fkey] FOREIGN KEY ([job_board_id]) REFERENCES [dbo].[job_boards]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[job_board_publications] ADD CONSTRAINT [job_board_publications_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
