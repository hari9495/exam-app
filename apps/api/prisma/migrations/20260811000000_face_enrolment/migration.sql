CREATE TABLE [dbo].[face_enrolments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [embedding] NVARCHAR(MAX),
    [reference_image_path] NVARCHAR(1000),
    [quality_json] NVARCHAR(MAX),
    [consent_at] DATETIME2 NOT NULL,
    [captured_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [face_enrolments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [face_enrolments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [face_enrolments_attempt_id_key] UNIQUE NONCLUSTERED ([attempt_id])
);

ALTER TABLE [dbo].[face_enrolments] ADD CONSTRAINT [face_enrolments_attempt_id_fkey]
    FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE [dbo].[exams] ADD [face_verification_enabled] BIT NOT NULL CONSTRAINT [exams_face_verification_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[exams] ADD [face_enrolment_policy] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_face_enrolment_policy_df] DEFAULT 'retry_then_allow';
