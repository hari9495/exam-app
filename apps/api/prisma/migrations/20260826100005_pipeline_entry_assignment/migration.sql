-- Team-collaboration Phase 2: assign a candidate (pipeline entry) to a staff teammate. Additive,
-- nullable -> no existing-row change; not FK-constrained (matches other user-id columns in this schema).
ALTER TABLE [dbo].[pipeline_entries] ADD [assigned_user_id] UNIQUEIDENTIFIER NULL;
