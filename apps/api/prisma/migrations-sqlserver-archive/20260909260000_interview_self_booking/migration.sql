-- Interview self-booking: candidate-picks-a-slot mode alongside the existing
-- recruiter-proposes-slots mode. Additive, interviews already RLS-enabled — no _rls file.
-- booking_mode default 'proposed' keeps every existing interview byte-identical.
ALTER TABLE [dbo].[interviews] ADD [booking_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [interviews_booking_mode_df] DEFAULT 'proposed';
ALTER TABLE [dbo].[interviews] ADD [booking_window_start] DATETIME2 NULL;
ALTER TABLE [dbo].[interviews] ADD [booking_window_end] DATETIME2 NULL;
ALTER TABLE [dbo].[interviews] ADD [slot_duration_minutes] INT NULL;
