import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_SECURITY_FLOOR } from '@exam-platform/shared';
import { CREATABLE_ROLES } from '../../rbac/roles';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Optional: omitted for SSO-enabled orgs, where UsersService generates a random,
  // unusable password server-side instead (SSO sign-in never checks passwordHash).
  // Required otherwise -- enforced in UsersService.create, not here, since that
  // depends on whether the org has an active identity provider, not just the DTO's own shape.
  @IsOptional()
  @IsString()
  @MinLength(TENANT_SECURITY_FLOOR.passwordMinLength)
  @MaxLength(TENANT_SECURITY_FLOOR.passwordMaxLength)
  password?: string;

  @IsIn(CREATABLE_ROLES)
  role!: string;
}
