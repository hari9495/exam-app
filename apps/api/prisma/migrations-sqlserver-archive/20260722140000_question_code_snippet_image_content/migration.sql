ALTER TABLE [dbo].[questions] ADD [snippet_code] NVARCHAR(MAX), [snippet_language] NVARCHAR(1000), [image_url] NVARCHAR(1000);

ALTER TABLE [dbo].[question_options] ADD [image_url] NVARCHAR(1000);
