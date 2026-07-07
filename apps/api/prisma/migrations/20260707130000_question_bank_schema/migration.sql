-- CreateTable
CREATE TABLE [dbo].[questions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [text] NVARCHAR(MAX) NOT NULL,
    [topic] NVARCHAR(1000),
    [category] NVARCHAR(1000),
    [difficulty] NVARCHAR(1000) NOT NULL,
    [marks] INT NOT NULL,
    [negative_marks] INT NOT NULL CONSTRAINT [questions_negative_marks_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [questions_status_df] DEFAULT 'active',
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [questions_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [questions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[question_options] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [text] NVARCHAR(1000) NOT NULL,
    [is_correct] BIT NOT NULL,
    [order_index] INT NOT NULL,
    CONSTRAINT [question_options_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [questions_organization_id_topic_difficulty_idx] ON [dbo].[questions]([organization_id], [topic], [difficulty]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [question_options_question_id_idx] ON [dbo].[question_options]([question_id]);

-- AddForeignKey
ALTER TABLE [dbo].[question_options] ADD CONSTRAINT [question_options_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
