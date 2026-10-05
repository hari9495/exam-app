-- Requisitions & Approvals: approval chains/steps/requests/decisions, plus
-- requisition fields on jobs and org-hierarchy manager_id on users.
-- RLS predicates for the two org-scoped tables (approval_chains,
-- approval_requests) are added in the follow-up migration
-- 20260903120001_requisitions_and_approvals_rls, not here: SQL Server cannot
-- resolve ALTER SECURITY POLICY ... ON dbo.<table> in the same batch/transaction
-- as the CREATE TABLE that defines it (verified in this repo, e.g.
-- 20260818090000_ats_pipeline + 20260818090001_ats_pipeline_rls); every
-- RLS-extension migration here follows the same split-file convention.
CREATE TABLE [dbo].[approval_chains] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [approval_chains_pkey] PRIMARY KEY,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [gate] NVARCHAR(1000) NOT NULL,
    [enabled] BIT NOT NULL CONSTRAINT [approval_chains_enabled_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [approval_chains_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [approval_chains_org_gate_key] UNIQUE ([organization_id],[gate])
);

CREATE TABLE [dbo].[approval_chain_steps] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [approval_chain_steps_pkey] PRIMARY KEY,
    [chain_id] UNIQUEIDENTIFIER NOT NULL,
    [position] INT NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [approver_type] NVARCHAR(1000) NOT NULL,
    [approver_user_ids] NVARCHAR(MAX),
    [manager_level] INT
);

CREATE TABLE [dbo].[approval_requests] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [approval_requests_pkey] PRIMARY KEY,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [gate] NVARCHAR(1000) NOT NULL,
    [subject_type] NVARCHAR(1000) NOT NULL,
    [subject_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [approval_requests_status_df] DEFAULT 'pending_approval',
    [current_step_position] INT NOT NULL,
    [submitted_by_user_id] UNIQUEIDENTIFIER NOT NULL,
    [submitted_at] DATETIME2 NOT NULL CONSTRAINT [approval_requests_submitted_at_df] DEFAULT CURRENT_TIMESTAMP,
    [decided_at] DATETIME2,
    [chain_snapshot_json] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [approval_requests_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL
);

CREATE TABLE [dbo].[approval_decisions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [approval_decisions_pkey] PRIMARY KEY,
    [request_id] UNIQUEIDENTIFIER NOT NULL,
    [step_position] INT NOT NULL,
    [approver_user_id] UNIQUEIDENTIFIER NOT NULL,
    [decision] NVARCHAR(1000) NOT NULL,
    [note] NVARCHAR(MAX),
    [decided_at] DATETIME2 NOT NULL CONSTRAINT [approval_decisions_decided_at_df] DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [approval_chain_steps_chain_id_idx] ON [dbo].[approval_chain_steps]([chain_id]);

CREATE NONCLUSTERED INDEX [approval_requests_organization_id_status_idx] ON [dbo].[approval_requests]([organization_id],[status]);

CREATE NONCLUSTERED INDEX [approval_requests_subject_type_subject_id_idx] ON [dbo].[approval_requests]([subject_type],[subject_id]);

CREATE NONCLUSTERED INDEX [approval_decisions_request_id_idx] ON [dbo].[approval_decisions]([request_id]);

-- AddForeignKey
ALTER TABLE [dbo].[approval_chain_steps] ADD CONSTRAINT [approval_chain_steps_chain_id_fkey] FOREIGN KEY ([chain_id]) REFERENCES [dbo].[approval_chains]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE [dbo].[approval_decisions] ADD CONSTRAINT [approval_decisions_request_id_fkey] FOREIGN KEY ([request_id]) REFERENCES [dbo].[approval_requests]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AlterTable: requisition fields on jobs
ALTER TABLE [dbo].[jobs] ADD
    [department] NVARCHAR(200),
    [hiring_manager_id] UNIQUEIDENTIFIER,
    [headcount] INT,
    [salary_min] INT,
    [salary_max] INT,
    [salary_currency] NVARCHAR(10);

-- AlterTable: org hierarchy
ALTER TABLE [dbo].[users] ADD [manager_id] UNIQUEIDENTIFIER;
