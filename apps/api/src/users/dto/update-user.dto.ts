import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

const EDITABLE_ROLES = ['org_admin', 'recruiter', 'panel'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsIn(EDITABLE_ROLES)
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
