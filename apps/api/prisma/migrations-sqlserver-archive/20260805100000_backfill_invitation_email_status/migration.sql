-- Backfill email_status for invitations that existed before the column was added.
-- The add-column migration defaulted every pre-existing row to 'pending', which the
-- UI reads as "In queue" -- wrong for invitations whose email settled long ago.
-- Derive the real state from the notifications table: failed first, then sent wins
-- (a row with both had a failed attempt followed by a successful resend).

UPDATE [dbo].[invitations]
SET [email_status] = 'failed'
WHERE [email_status] = 'pending'
  AND EXISTS (SELECT 1 FROM [dbo].[notifications] n WHERE n.[invitation_id] = [invitations].[id] AND n.[status] = 'failed');

UPDATE [dbo].[invitations]
SET [email_status] = 'sent'
WHERE [email_status] IN ('pending', 'failed')
  AND EXISTS (SELECT 1 FROM [dbo].[notifications] n WHERE n.[invitation_id] = [invitations].[id] AND n.[status] = 'sent');

-- Walk-in registrations only send an untracked courtesy link email (no Notification
-- record, no resend) -- 'none' keeps them out of the recruiter-facing email lifecycle
-- (matches what walk-in.service now sets at create).
UPDATE [dbo].[invitations]
SET [email_status] = 'none'
WHERE [source] = 'walk_in';

-- Remaining rows with no notification record predate reliable tracking -- treat as
-- settled rather than leaving them stuck "In queue" forever (which would also make
-- the recruiter UI poll the API every 2s). The 10-minute grace keeps a genuinely
-- in-flight send (created moments before this migration runs) pending.
UPDATE [dbo].[invitations]
SET [email_status] = 'sent'
WHERE [email_status] = 'pending'
  AND [invited_at] < DATEADD(MINUTE, -10, GETUTCDATE());
