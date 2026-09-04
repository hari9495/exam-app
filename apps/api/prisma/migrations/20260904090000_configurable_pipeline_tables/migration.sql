CREATE TABLE [pipelines] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [pipelines_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [is_default] BIT NOT NULL CONSTRAINT [pipelines_is_default_df] DEFAULT 0,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [pipelines_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL
);
CREATE INDEX [pipelines_organization_id_idx] ON [pipelines]([organization_id]);

CREATE TABLE [pipeline_stages] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [pipeline_stages_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [pipeline_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [category] NVARCHAR(20) NOT NULL,
  [position] INT NOT NULL,
  CONSTRAINT [pipeline_stages_pipeline_fk] FOREIGN KEY ([pipeline_id]) REFERENCES [pipelines]([id]) ON DELETE CASCADE
);
CREATE INDEX [pipeline_stages_pipeline_id_idx] ON [pipeline_stages]([pipeline_id]);

CREATE TABLE [pipeline_statuses] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [pipeline_statuses_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [stage_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [position] INT NOT NULL,
  CONSTRAINT [pipeline_statuses_stage_fk] FOREIGN KEY ([stage_id]) REFERENCES [pipeline_stages]([id]) ON DELETE CASCADE
);
CREATE INDEX [pipeline_statuses_stage_id_idx] ON [pipeline_statuses]([stage_id]);

ALTER TABLE [jobs] ADD [pipeline_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [pipeline_entries] ADD [status_id] UNIQUEIDENTIFIER NULL, [archived_at] DATETIME2 NULL;
ALTER TABLE [jobs] ADD CONSTRAINT [jobs_pipeline_fk] FOREIGN KEY ([pipeline_id]) REFERENCES [pipelines]([id]);
ALTER TABLE [pipeline_entries] ADD CONSTRAINT [pipeline_entries_status_fk] FOREIGN KEY ([status_id]) REFERENCES [pipeline_statuses]([id]);
