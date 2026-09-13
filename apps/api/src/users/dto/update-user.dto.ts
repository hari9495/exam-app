import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { CREATABLE_ROLES } from '../../rbac/roles';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(CREATABLE_ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  // A UUID assigns the caller's org profile; explicit null clears the assignment.
  // Omitted leaves the current assignment untouched -- see UsersService.update.
  @ValidateIf((o) => o.permissionProfileId !== null && o.permissionProfileId !== undefined)
  @IsUUID()
  @IsOptional()
  permissionProfileId?: string | null;
}
