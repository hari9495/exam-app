import { IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertPermissionProfileDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  // Per-user field rules (entity->field->level). Shape validated in the service via
  // validateUserFieldPermissions. Omitted/undefined = no field overrides.
  @IsOptional()
  @IsObject()
  fieldPermissions?: Record<string, unknown>;
}

// PATCH variant: both fields optional so a caller can rename without resending the permission
// set, or vice versa.
export class UpdatePermissionProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsObject()
  fieldPermissions?: Record<string, unknown>;
}
