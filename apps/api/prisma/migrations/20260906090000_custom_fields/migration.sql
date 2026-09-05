CREATE TABLE [dbo].[custom_field_definitions] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [custom_field_definitions_pkey] PRIMARY KEY CONSTRAINT [custom_field_definitions_id_df] DEFAULT newid(),
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [entity_type] NVARCHAR(20) NOT NULL,
  [key] NVARCHAR(100) NOT NULL,
  [label] NVARCHAR(200) NOT NULL,
  [field_type] NVARCHAR(20) NOT NULL,
  [options_json] NVARCHAR(max),
  [required] BIT NOT NULL CONSTRAINT [custom_field_definitions_required_df] DEFAULT 0,
  [show_on_apply] BIT NOT NULL CONSTRAINT [custom_field_definitions_show_on_apply_df] DEFAULT 0,
  [position] INT NOT NULL CONSTRAINT [custom_field_definitions_position_df] DEFAULT 0,
  [archived_at] DATETIME2,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [custom_field_definitions_created_at_df] DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX [custom_field_definitions_org_entity_key] ON [dbo].[custom_field_definitions]([organization_id], [entity_type], [key]);
CREATE INDEX [custom_field_definitions_org_entity_idx] ON [dbo].[custom_field_definitions]([organization_id], [entity_type]);

CREATE TABLE [dbo].[custom_field_values] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [custom_field_values_pkey] PRIMARY KEY CONSTRAINT [custom_field_values_id_df] DEFAULT newid(),
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [definition_id] UNIQUEIDENTIFIER NOT NULL,
  [entity_type] NVARCHAR(20) NOT NULL,
  [entity_id] UNIQUEIDENTIFIER NOT NULL,
  [value_text] NVARCHAR(max),
  [value_number] FLOAT(53),
  [value_date] DATETIME2,
  [updated_at] DATETIME2 NOT NULL CONSTRAINT [custom_field_values_updated_at_df] DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX [custom_field_values_org_def_entity] ON [dbo].[custom_field_values]([organization_id], [definition_id], [entity_id]);
CREATE INDEX [custom_field_values_org_entity_idx] ON [dbo].[custom_field_values]([organization_id], [entity_type], [entity_id]);
