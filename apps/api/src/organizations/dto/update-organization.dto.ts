import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Platform-admin edit of an organization.
 *
 * There is deliberately no `slug` field. The slug appears in invitation URLs and
 * in SAML entity IDs, so changing it would break live candidate links and an
 * org's SSO trust relationship at the same time.
 */
export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(['us', 'eu'])
  region?: string;
}

export class UpdateOrganizationStatusDto {
  // 'deleted' is deliberately not accepted here -- deletion goes through
  // DELETE /organizations/:id, which carries a live-exam guard this does not.
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}
