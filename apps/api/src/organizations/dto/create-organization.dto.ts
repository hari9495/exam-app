import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug!: string;

  @IsIn(['us', 'eu'])
  region!: string;

  @IsEmail()
  adminEmail!: string;

  // Optional at the API boundary on purpose: the e2e specs and any existing
  // script call this endpoint without it, and requiring it would break them for
  // no safety gain. The platform-admin form marks it required, so organizations
  // created through the UI always carry a name.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  adminName?: string;
}
