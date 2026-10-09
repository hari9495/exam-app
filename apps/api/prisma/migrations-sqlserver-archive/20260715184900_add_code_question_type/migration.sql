-- AlterTable
ALTER TABLE [questions] ADD [code_language] NVARCHAR(1000),
[starter_code] NVARCHAR(MAX);

-- AlterTable
ALTER TABLE [answers] ADD [answer_text] NVARCHAR(MAX),
[grading_feedback] NVARCHAR(MAX);

-- CreateTable
CREATE TABLE [code_answer_reviews] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [code_answer_reviews_id_default] DEFAULT newsequentialid(),
    [answer_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [suggested_marks] INT,
    [summary] NVARCHAR(MAX),
    [generated_at] DATETIME2 NOT NULL CONSTRAINT [code_answer_reviews_generated_at_default] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [code_answer_reviews_pkey] PRIMARY KEY ([id]),
    CONSTRAINT [code_answer_reviews_answer_id_key] UNIQUE ([answer_id]),
    CONSTRAINT [code_answer_reviews_answer_id_fkey] FOREIGN KEY ([answer_id]) REFERENCES [answers]([id]) ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX [code_answer_reviews_answer_id_idx] ON [code_answer_reviews]([answer_id]);
