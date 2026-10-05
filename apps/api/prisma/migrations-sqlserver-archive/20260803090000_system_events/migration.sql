-- Production error/diagnostic events (unhandled backend exceptions, candidate-browser
-- failures). No FK to organizations by design: org id is a pure scoping value for RLS.
CREATE TABLE [dbo].[system_events] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [system_events_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER,
    [service] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL,
    [message] NVARCHAR(2000) NOT NULL,
    [context_json] NVARCHAR(max),
    [occurred_at] DATETIME2 NOT NULL CONSTRAINT [system_events_occurred_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [system_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [system_events_organization_id_occurred_at_idx] ON [dbo].[system_events]([organization_id], [occurred_at]);
CREATE NONCLUSTERED INDEX [system_events_occurred_at_idx] ON [dbo].[system_events]([occurred_at]);
CREATE NONCLUSTERED INDEX [system_events_service_idx] ON [dbo].[system_events]([service]);
