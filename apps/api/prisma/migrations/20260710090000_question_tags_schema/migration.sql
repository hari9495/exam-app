-- CreateTable
CREATE TABLE [dbo].[tags] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [tags_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [tags_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[question_tags] (
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [tag_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [question_tags_pkey] PRIMARY KEY CLUSTERED ([question_id],[tag_id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [tags_organization_id_name_key] ON [dbo].[tags]([organization_id], [name]);

-- AddForeignKey
ALTER TABLE [dbo].[question_tags] ADD CONSTRAINT [question_tags_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[question_tags] ADD CONSTRAINT [question_tags_tag_id_fkey] FOREIGN KEY ([tag_id]) REFERENCES [dbo].[tags]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
