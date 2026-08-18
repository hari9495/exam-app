-- CreateTable
CREATE TABLE [dbo].[interviews] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [pipeline_entry_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [interviews_status_df] DEFAULT 'proposed',
    [interview_token] NVARCHAR(1000),
    [location] NVARCHAR(MAX) NOT NULL,
    [time_zone] NVARCHAR(1000) NOT NULL,
    [recruiter_note] NVARCHAR(MAX),
    [confirmed_slot_id] UNIQUEIDENTIFIER,
    [candidate_resched_note] NVARCHAR(MAX),
    [sent_by_user_id] UNIQUEIDENTIFIER,
    [sent_at] DATETIME2,
    [responded_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [interviews_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [interviews_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- Filtered unique index on the nullable interview_token: a plain UNIQUE constraint on a
-- nullable column permits only ONE NULL row table-wide on SQL Server, which would fail the
-- 2nd un-sent (token=NULL) interview. Filter to non-null so many un-sent interviews coexist.
-- Same pattern as 20260819090000_candidate_experience (pipeline_entries.application_token).
CREATE UNIQUE NONCLUSTERED INDEX [interviews_interview_token_key] ON [dbo].[interviews]([interview_token]) WHERE [interview_token] IS NOT NULL;

-- CreateTable
CREATE TABLE [dbo].[interview_slots] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [interview_id] UNIQUEIDENTIFIER NOT NULL,
    [starts_at] DATETIME2 NOT NULL,
    [ends_at] DATETIME2 NOT NULL,
    CONSTRAINT [interview_slots_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[interview_panelists] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [interview_id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [interview_panelists_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [interview_panelists_interview_id_user_id_key] UNIQUE NONCLUSTERED ([interview_id], [user_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [interviews_organization_id_pipeline_entry_id_idx] ON [dbo].[interviews]([organization_id], [pipeline_entry_id]);
CREATE NONCLUSTERED INDEX [interviews_organization_id_candidate_id_idx] ON [dbo].[interviews]([organization_id], [candidate_id]);
CREATE NONCLUSTERED INDEX [interview_slots_interview_id_idx] ON [dbo].[interview_slots]([interview_id]);
CREATE NONCLUSTERED INDEX [interview_panelists_organization_id_user_id_idx] ON [dbo].[interview_panelists]([organization_id], [user_id]);

-- AddForeignKey
ALTER TABLE [dbo].[interviews] ADD CONSTRAINT [interviews_pipeline_entry_id_fkey] FOREIGN KEY ([pipeline_entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE [dbo].[interview_slots] ADD CONSTRAINT [interview_slots_interview_id_fkey] FOREIGN KEY ([interview_id]) REFERENCES [dbo].[interviews]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE [dbo].[interview_panelists] ADD CONSTRAINT [interview_panelists_interview_id_fkey] FOREIGN KEY ([interview_id]) REFERENCES [dbo].[interviews]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Seed interview:view_assigned onto panel/recruiter/org_admin (seed.ts does not run on deploy).
DECLARE @ivPermId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE [key] = 'interview:view_assigned')
  INSERT INTO dbo.permissions (id, [key], description)
  VALUES (@ivPermId, 'interview:view_assigned', 'View interviews you are assigned to as a panelist');
DECLARE @ivPid UNIQUEIDENTIFIER = (SELECT id FROM dbo.permissions WHERE [key] = 'interview:view_assigned');
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'panel' AND permission_id = @ivPid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('panel', @ivPid);
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'recruiter' AND permission_id = @ivPid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('recruiter', @ivPid);
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'org_admin' AND permission_id = @ivPid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('org_admin', @ivPid);
