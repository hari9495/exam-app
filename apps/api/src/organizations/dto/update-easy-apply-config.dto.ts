import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { EASY_APPLY_PROVIDER_IDS } from '../../easy-apply/providers';

export class UpdateEasyApplyConfigDto {
  @IsIn(EASY_APPLY_PROVIDER_IDS as unknown as string[])
  provider!: string;

  // The shared secret the board must send back on each ingestion call. Write-only: blank/omitted
  // keeps the existing secret (blank-on-PUT), same as the SMS/SMTP secret pattern.
  // Answer 2631: a set secret is at least 16 characters (blank still keeps the stored one).
  @IsOptional()
  @IsString()
  @ValidateIf((o: { secret?: string }) => Boolean(o.secret?.trim()))
  @MinLength(16)
  @MaxLength(200)
  secret?: string;

  // enabled:false removes the provider's config (disables ingestion for it).
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
