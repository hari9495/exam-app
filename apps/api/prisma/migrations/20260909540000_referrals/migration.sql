CREATE TABLE [dbo].[referrals] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [referrals_id_df] DEFAULT NEWID(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [referrer_user_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [entry_id] UNIQUEIDENTIFIER NOT NULL,
    [note] NVARCHAR(MAX),
    [reward_status] NVARCHAR(1000) NOT NULL CONSTRAINT [referrals_reward_status_df] DEFAULT 'pending',
    [reward_note] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [referrals_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [referrals_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE UNIQUE INDEX [referrals_entry_id_key] ON [dbo].[referrals]([entry_id]);
CREATE INDEX [referrals_org_referrer_idx] ON [dbo].[referrals]([organization_id], [referrer_user_id]);
CREATE INDEX [referrals_org_created_idx] ON [dbo].[referrals]([organization_id], [created_at]);
