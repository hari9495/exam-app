-- Correct all UUID-valued id/foreign-key columns from the Prisma default
-- mapping (NVARCHAR(1000)) to the correct native SQL Server type
-- (UNIQUEIDENTIFIER). Every value ever stored in these columns is a
-- well-formed UUID; the previous NVARCHAR mapping only "worked" because
-- SQL Server implicitly converts NVARCHAR to UNIQUEIDENTIFIER when
-- fn_tenant_access_predicate (which takes a UNIQUEIDENTIFIER parameter) is
-- evaluated against users.organization_id / audit_logs.organization_id.
--
-- Order of operations, required because SQL Server will not ALTER COLUMN a
-- column that is part of an active FOREIGN KEY, PRIMARY KEY, or UNIQUE
-- constraint:
--   1. Drop all FOREIGN KEY constraints touching an affected column
--      (either side of the relationship).
--   2. Drop the PRIMARY KEY / UNIQUE constraints and DEFAULT constraints
--      that would otherwise block the ALTER COLUMN on each table.
--   3. ALTER COLUMN each affected column to UNIQUEIDENTIFIER.
--   4. Re-add the PRIMARY KEY / UNIQUE / DEFAULT constraints.
--   5. Re-add the FOREIGN KEY constraints.
--
-- (The tenant RLS function and security policy that also depend on
-- users.organization_id / audit_logs.organization_id were already dropped
-- in the two preceding migrations, and are recreated in the two
-- migrations that follow this one.)

BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_organization_id_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[organizations] DROP CONSTRAINT [organizations_plan_id_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[refresh_tokens] DROP CONSTRAINT [refresh_tokens_user_id_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[role_permissions] DROP CONSTRAINT [role_permissions_permission_id_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_organization_id_fkey];

-- DropIndex
ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_organization_id_email_key];

-- AlterTable
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_created_at_df],
[audit_logs_pkey];
ALTER TABLE [dbo].[audit_logs] ALTER COLUMN [id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[audit_logs] ALTER COLUMN [organization_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[audit_logs] ALTER COLUMN [actor_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP FOR [created_at], CONSTRAINT audit_logs_pkey PRIMARY KEY CLUSTERED ([id]);

-- AlterTable
ALTER TABLE [dbo].[organizations] DROP CONSTRAINT [organizations_created_at_df],
[organizations_pkey];
ALTER TABLE [dbo].[organizations] ALTER COLUMN [id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[organizations] ALTER COLUMN [plan_id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[organizations] ADD CONSTRAINT [organizations_created_at_df] DEFAULT CURRENT_TIMESTAMP FOR [created_at], CONSTRAINT organizations_pkey PRIMARY KEY CLUSTERED ([id]);

-- AlterTable
ALTER TABLE [dbo].[permissions] DROP CONSTRAINT [permissions_pkey];
ALTER TABLE [dbo].[permissions] ALTER COLUMN [id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[permissions] ADD CONSTRAINT permissions_pkey PRIMARY KEY CLUSTERED ([id]);

-- AlterTable
ALTER TABLE [dbo].[plans] DROP CONSTRAINT [plans_created_at_df],
[plans_pkey];
ALTER TABLE [dbo].[plans] ALTER COLUMN [id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[plans] ADD CONSTRAINT [plans_created_at_df] DEFAULT CURRENT_TIMESTAMP FOR [created_at], CONSTRAINT plans_pkey PRIMARY KEY CLUSTERED ([id]);

-- AlterTable
ALTER TABLE [dbo].[refresh_tokens] DROP CONSTRAINT [refresh_tokens_created_at_df],
[refresh_tokens_pkey];
ALTER TABLE [dbo].[refresh_tokens] ALTER COLUMN [id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[refresh_tokens] ALTER COLUMN [user_id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP FOR [created_at], CONSTRAINT refresh_tokens_pkey PRIMARY KEY CLUSTERED ([id]);

-- AlterTable
ALTER TABLE [dbo].[role_permissions] DROP CONSTRAINT [role_permissions_pkey];
ALTER TABLE [dbo].[role_permissions] ALTER COLUMN [permission_id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT role_permissions_pkey PRIMARY KEY CLUSTERED ([role],[permission_id]);

-- AlterTable
ALTER TABLE [dbo].[users] DROP CONSTRAINT [users_created_at_df],
[users_pkey];
ALTER TABLE [dbo].[users] ALTER COLUMN [id] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [dbo].[users] ALTER COLUMN [organization_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP FOR [created_at], CONSTRAINT users_pkey PRIMARY KEY CLUSTERED ([id]);

-- CreateIndex
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_organization_id_email_key] UNIQUE NONCLUSTERED ([organization_id], [email]);

-- AddForeignKey
ALTER TABLE [dbo].[organizations] ADD CONSTRAINT [organizations_plan_id_fkey] FOREIGN KEY ([plan_id]) REFERENCES [dbo].[plans]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[role_permissions] ADD CONSTRAINT [role_permissions_permission_id_fkey] FOREIGN KEY ([permission_id]) REFERENCES [dbo].[permissions]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
