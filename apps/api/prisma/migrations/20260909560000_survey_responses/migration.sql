CREATE TABLE [dbo].[survey_responses] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [survey_responses_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [survey_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [entry_id] UNIQUEIDENTIFIER NOT NULL,
    [token] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [survey_responses_status_df] DEFAULT 'pending',
    [answers_json] NVARCHAR(MAX),
    [invited_at] DATETIME2 NOT NULL CONSTRAINT [survey_responses_invited_at_df] DEFAULT GETUTCDATE(),
    [submitted_at] DATETIME2,
    CONSTRAINT [survey_responses_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE INDEX [survey_responses_token_key] ON [dbo].[survey_responses]([token]);
CREATE UNIQUE INDEX [survey_responses_survey_id_entry_id_key] ON [dbo].[survey_responses]([survey_id], [entry_id]);
CREATE INDEX [survey_responses_org_survey_idx] ON [dbo].[survey_responses]([organization_id], [survey_id]);
