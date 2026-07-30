import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const EDITABLE_ROLES = ['org_admin', 'recruiter', 'panel'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsIn(EDITABLE_ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
