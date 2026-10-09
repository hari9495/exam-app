-- Grandfather every EXISTING organization onto an effectively-unlimited plan BEFORE Phase-1 quota
-- enforcement goes live, so no current client loses access on deploy. All existing orgs are on the
-- seeded 'trial' plan (ai_credit_limit=10, proctoring_minutes_limit=60) — enforcing those retroactively
-- would 402-block AI features and proctored-exam starts for anyone already over this month. New sign-ups
-- keep 'trial' (organizations.service.ts sets planId=trial on create); real paid plans get assigned
-- deliberately afterward.
--
-- "Unlimited" is a very high INT (the design has no sentinel): 1e9 is far above any real monthly usage
-- and well under INT max (2,147,483,647). Idempotent — safe to re-run.

IF NOT EXISTS (SELECT 1 FROM [dbo].[plans] WHERE [id] = '00000000-0000-0000-0000-000000000002')
  INSERT INTO [dbo].[plans] ([id], [name], [candidate_limit], [ai_credit_limit], [proctoring_minutes_limit], [seat_limit], [is_public])
  VALUES ('00000000-0000-0000-0000-000000000002', 'legacy_unlimited', 1000000000, 1000000000, 1000000000, 1000000000, 0);

-- Re-point every existing organization onto the grandfathered plan.
UPDATE [dbo].[organizations] SET [plan_id] = '00000000-0000-0000-0000-000000000002';
