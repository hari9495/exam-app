import { IsObject } from 'class-validator';

// Permissive on purpose: validateFieldPermissions (packages/shared/src/field-permissions/field-permissions.ts)
// is the real gate (unknown entity/role/field all throw), enforced in FieldPermissionsService.setConfig.
export class UpdateFieldPermissionsDto {
  @IsObject()
  config!: Record<string, unknown>;
}
