-- Candidate SMS (Zoho #16): org Twilio config + candidate opt-out flag, plus the
-- CandidateSms send-log and CandidateSmsTemplate tables mirroring candidate_emails /
-- candidate_email_templates. Additive-only on organizations/candidates (no RLS needed
-- for those columns; RLS predicates for the two new tables land in the next migration).
ALTER TABLE [dbo].[organizations] ADD [sms_enabled] BIT NOT NULL CONSTRAINT [DF_organizations_sms_enabled] DEFAULT 0, [sms_account_sid] NVARCHAR(1000) NULL, [sms_auth_token_encrypted] NVARCHAR(1000) NULL, [sms_from_number] NVARCHAR(1000) NULL;
ALTER TABLE [dbo].[candidates] ADD [sms_opted_out_at] DATETIME2 NULL;

-- CreateTable
CREATE TABLE [dbo].[candidate_sms_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [trigger_stage_id] UNIQUEIDENTIFIER,
    [trigger_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [candidate_sms_templates_trigger_mode_df] DEFAULT 'manual',
    [body] NVARCHAR(MAX) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [candidate_sms_templates_enabled_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_sms_templates_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_sms_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[candidate_sms] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER,
    [template_id] UNIQUEIDENTIFIER,
    [to_phone] NVARCHAR(1000) NOT NULL,
    [rendered_body] NVARCHAR(MAX) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [error_detail] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_sms_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [candidate_sms_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_sms_templates_organization_id_idx] ON [dbo].[candidate_sms_templates]([organization_id]);
CREATE NONCLUSTERED INDEX [candidate_sms_organization_id_candidate_id_idx] ON [dbo].[candidate_sms]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [candidate_sms_pipeline_entry_id_idx] ON [dbo].[candidate_sms]([pipeline_entry_id]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_sms] ADD CONSTRAINT [candidate_sms_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
