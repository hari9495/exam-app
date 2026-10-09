-- AlterTable: Plan additive columns
ALTER TABLE [dbo].[plans] ADD
  [seat_limit] INT NOT NULL CONSTRAINT [plans_seat_limit_df] DEFAULT 5,
  [price_label] NVARCHAR(1000),
  [billing_interval] NVARCHAR(1000) NOT NULL CONSTRAINT [plans_billing_interval_df] DEFAULT 'month',
  [is_public] BIT NOT NULL CONSTRAINT [plans_is_public_df] DEFAULT 1,
  [stripe_product_id] NVARCHAR(1000),
  [stripe_price_id] NVARCHAR(1000);

-- AlterTable: Organization seam columns
ALTER TABLE [dbo].[organizations] ADD
  [billing_status] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_billing_status_df] DEFAULT 'active',
  [stripe_customer_id] NVARCHAR(1000),
  [stripe_subscription_id] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[billing_notices] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [dimension] NVARCHAR(1000) NOT NULL,
    [threshold] INT NOT NULL,
    [period_start] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [billing_notices_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [billing_notices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [billing_notices_org_dim_thr_period_key] UNIQUE NONCLUSTERED ([organization_id],[dimension],[threshold],[period_start])
);
CREATE NONCLUSTERED INDEX [billing_notices_organization_id_idx] ON [dbo].[billing_notices]([organization_id]);

-- Seed permission org:manage_billing (idempotent; seed.ts does not run on deploy)
DECLARE @permId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE [key] = 'org:manage_billing')
  INSERT INTO dbo.permissions (id, [key], description)
  VALUES (@permId, 'org:manage_billing', 'View organization billing, plan, and usage');
DECLARE @pid UNIQUEIDENTIFIER = (SELECT id FROM dbo.permissions WHERE [key] = 'org:manage_billing');
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'org_admin' AND permission_id = @pid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('org_admin', @pid);

-- (Seat-limit backfill is unnecessary: the ADD above applies DEFAULT 5 to every
-- existing row. A same-batch `UPDATE ... SET seat_limit` fails to parse on SQL Server
-- because the column isn't visible until the batch completes — error 207.)
