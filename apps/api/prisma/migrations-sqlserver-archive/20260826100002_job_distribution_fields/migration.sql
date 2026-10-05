-- Job distribution (2d): optional location + employment type so the public JobPosting JSON-LD
-- (Google for Jobs) and the aggregator feed are valid/complete. Additive, nullable -> no existing
-- row changes and no backfill needed.
ALTER TABLE [dbo].[jobs] ADD [location] NVARCHAR(200) NULL;
ALTER TABLE [dbo].[jobs] ADD [employment_type] NVARCHAR(50) NULL;
