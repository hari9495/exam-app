-- CreateTable
CREATE TABLE [dbo].[exams] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [instructions] NVARCHAR(MAX),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_status_df] DEFAULT 'active',
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [exams_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [exams_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_sections] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [order_index] INT NOT NULL,
    CONSTRAINT [exam_sections_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_section_questions] (
    [section_id] UNIQUEIDENTIFIER NOT NULL,
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [order_index] INT NOT NULL,
    CONSTRAINT [exam_section_questions_pkey] PRIMARY KEY CLUSTERED ([section_id],[question_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exams_organization_id_status_idx] ON [dbo].[exams]([organization_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sections_exam_id_idx] ON [dbo].[exam_sections]([exam_id]);

-- AddForeignKey
ALTER TABLE [dbo].[exam_sections] ADD CONSTRAINT [exam_sections_exam_id_fkey] FOREIGN KEY ([exam_id]) REFERENCES [dbo].[exams]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_questions] ADD CONSTRAINT [exam_section_questions_section_id_fkey] FOREIGN KEY ([section_id]) REFERENCES [dbo].[exam_sections]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_questions] ADD CONSTRAINT [exam_section_questions_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
