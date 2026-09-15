CREATE TABLE [dbo].[drip_enrolments] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [drip_enrolments_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [campaign_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [entry_id] UNIQUEIDENTIFIER NOT NULL,
    [current_step_index] INT NOT NULL CONSTRAINT [drip_enrolments_current_step_index_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [drip_enrolments_status_df] DEFAULT 'active',
    [next_step_due_at] DATETIME2 NOT NULL,
    [enrolled_at] DATETIME2 NOT NULL CONSTRAINT [drip_enrolments_enrolled_at_df] DEFAULT GETUTCDATE(),
    [last_sent_at] DATETIME2,
    [exit_reason] NVARCHAR(1000),
    CONSTRAINT [drip_enrolments_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE INDEX [drip_enrolments_campaign_candidate_key] ON [dbo].[drip_enrolments]([campaign_id], [candidate_id]);
CREATE INDEX [drip_enrolments_due_idx] ON [dbo].[drip_enrolments]([organization_id], [status], [next_step_due_at]);
