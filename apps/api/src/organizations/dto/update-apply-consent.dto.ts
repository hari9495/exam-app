import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateApplyConsentDto {
  // Nullable (not just optional) so an admin can explicitly clear the consent
  // statement -- clearing it is how this feature is turned back off (see the
  // empty/whitespace -> null normalization in OrganizationsService.setApplyConsent).
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string | null;
}
