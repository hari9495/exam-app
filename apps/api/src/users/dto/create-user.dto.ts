import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  // Optional: omitted for SSO-enabled orgs, where UsersService generates a random,
  // unusable password server-side instead (SAML login never checks passwordHash).
  // Required otherwise -- enforced in UsersService.create, not here, since that
  // depends on the org's samlEnabled flag, not just the DTO's own shape.
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsIn(['org_admin', 'recruiter', 'panel'])
  role!: string;
}
