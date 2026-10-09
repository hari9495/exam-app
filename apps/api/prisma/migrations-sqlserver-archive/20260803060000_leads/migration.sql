-- CreateTable
CREATE TABLE [dbo].[leads] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [work_email] NVARCHAR(1000) NOT NULL,
    [company] NVARCHAR(1000) NOT NULL,
    [team_size] NVARCHAR(1000),
    [message] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [leads_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [leads_pkey] PRIMARY KEY CLUSTERED ([id])
);
