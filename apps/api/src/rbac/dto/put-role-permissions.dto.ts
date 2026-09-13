import { IsArray, IsString } from 'class-validator';

export class PutRolePermissionsDto {
  // The complete permission-key set for this role in this org. May be empty (lock the role down).
  // Keys are validated against the assignable catalog in the service.
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
