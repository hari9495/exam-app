-- AlterTable: attempts gains an optional device fingerprint, recorded (not enforced) at start.
-- A missing fingerprint is never a validation error -- see this plan's Global Constraints.
ALTER TABLE [dbo].[attempts] ADD [device_fingerprint] NVARCHAR(1000);

-- AlterTable: invitations gains the currently-active session's refresh-token family id. Checked
-- live on every candidate request (CandidateJwtStrategy) so a newer redeem kills an older
-- session's access token immediately, not just on its next refresh attempt.
ALTER TABLE [dbo].[invitations] ADD [active_session_family_id] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[proctoring_events] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [event_type] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL,
    [occurred_at] DATETIME2 NOT NULL CONSTRAINT [proctoring_events_occurred_at_df] DEFAULT GETUTCDATE(),
    [metadata_json] NVARCHAR(MAX),
    CONSTRAINT [proctoring_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [proctoring_events_attempt_id_occurred_at_idx] ON [dbo].[proctoring_events]([attempt_id], [occurred_at]);

-- AddForeignKey
ALTER TABLE [dbo].[proctoring_events] ADD CONSTRAINT [proctoring_events_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
