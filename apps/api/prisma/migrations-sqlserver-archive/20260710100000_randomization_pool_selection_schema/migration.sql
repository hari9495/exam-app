-- AlterTable
ALTER TABLE [dbo].[exams] ADD [randomize_order] BIT NOT NULL CONSTRAINT [exams_randomize_order_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[exam_sections] ADD [selection_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_sections_selection_mode_df] DEFAULT 'fixed',
[pool_size] INT,
[pool_difficulty] NVARCHAR(1000);

-- AlterTable
ALTER TABLE [dbo].[attempts] ADD [section_snapshot_json] NVARCHAR(MAX) NOT NULL CONSTRAINT [attempts_section_snapshot_json_df] DEFAULT '[]',
[option_order_json] NVARCHAR(MAX);

-- CreateTable
CREATE TABLE [dbo].[exam_section_pool_tags] (
    [section_id] UNIQUEIDENTIFIER NOT NULL,
    [tag_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [exam_section_pool_tags_pkey] PRIMARY KEY CLUSTERED ([section_id],[tag_id])
);

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_pool_tags] ADD CONSTRAINT [exam_section_pool_tags_section_id_fkey] FOREIGN KEY ([section_id]) REFERENCES [dbo].[exam_sections]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_pool_tags] ADD CONSTRAINT [exam_section_pool_tags_tag_id_fkey] FOREIGN KEY ([tag_id]) REFERENCES [dbo].[tags]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
