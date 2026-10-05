ALTER TABLE [dbo].[exams] ADD
    [results_release_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_results_release_mode_df] DEFAULT 'immediate';

ALTER TABLE [dbo].[results] ADD
    [release_override] NVARCHAR(1000),
    [released_at] DATETIME2;
