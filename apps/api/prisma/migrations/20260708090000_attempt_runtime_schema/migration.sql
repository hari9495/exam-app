-- AlterTable: exams gain durationMinutes and passCriteriaPercent, needed by the
-- Phase 1d exam-taking runtime for the server-authoritative timer and pass/fail
-- grading. Existing exams get sensible defaults rather than nullable columns.
ALTER TABLE [dbo].[exams] ADD [duration_minutes] INT NOT NULL CONSTRAINT [exams_duration_minutes_df] DEFAULT 60;
ALTER TABLE [dbo].[exams] ADD [pass_criteria_percent] INT NOT NULL CONSTRAINT [exams_pass_criteria_percent_df] DEFAULT 40;

-- CreateTable
CREATE TABLE [dbo].[attempts] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [invitation_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [attempts_status_df] DEFAULT 'in_progress',
    [question_order_json] NVARCHAR(MAX) NOT NULL,
    [started_at] DATETIME2 NOT NULL CONSTRAINT [attempts_started_at_df] DEFAULT GETUTCDATE(),
    [submitted_at] DATETIME2,
    CONSTRAINT [attempts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[answers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [selected_option_ids_json] NVARCHAR(MAX) NOT NULL,
    [is_marked_for_review] BIT NOT NULL CONSTRAINT [answers_is_marked_for_review_df] DEFAULT 0,
    [answered_at] DATETIME2 NOT NULL CONSTRAINT [answers_answered_at_df] DEFAULT GETUTCDATE(),
    [is_correct] BIT,
    [marks_awarded] INT,
    CONSTRAINT [answers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[results] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [score] INT NOT NULL,
    [max_score] INT NOT NULL,
    [percentage] FLOAT NOT NULL,
    [pass_fail] NVARCHAR(1000) NOT NULL,
    [computed_at] DATETIME2 NOT NULL CONSTRAINT [results_computed_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [results_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[candidate_refresh_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [invitation_id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [family_id] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_refresh_tokens_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [candidate_refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [attempts_invitation_id_key] ON [dbo].[attempts]([invitation_id]);
CREATE NONCLUSTERED INDEX [attempts_exam_id_status_idx] ON [dbo].[attempts]([exam_id], [status]);
CREATE UNIQUE NONCLUSTERED INDEX [answers_attempt_id_question_id_key] ON [dbo].[answers]([attempt_id], [question_id]);
CREATE UNIQUE NONCLUSTERED INDEX [results_attempt_id_key] ON [dbo].[results]([attempt_id]);
CREATE NONCLUSTERED INDEX [candidate_refresh_tokens_invitation_id_idx] ON [dbo].[candidate_refresh_tokens]([invitation_id]);

-- AddForeignKey
ALTER TABLE [dbo].[attempts] ADD CONSTRAINT [attempts_invitation_id_fkey] FOREIGN KEY ([invitation_id]) REFERENCES [dbo].[invitations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[answers] ADD CONSTRAINT [answers_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[answers] ADD CONSTRAINT [answers_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[results] ADD CONSTRAINT [results_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[candidate_refresh_tokens] ADD CONSTRAINT [candidate_refresh_tokens_invitation_id_fkey] FOREIGN KEY ([invitation_id]) REFERENCES [dbo].[invitations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
