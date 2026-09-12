import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { EASY_APPLY_PROVIDER_IDS } from '../../easy-apply/providers';

export class UpdateEasyApplyConfigDto {
  @IsIn(EASY_APPLY_PROVIDER_IDS as unknown as string[])
  provider!: string;

  // The shared secret the board must send back on each ingestion call. Write-only: blank/omitted
  // keeps the existing secret (blank-on-PUT), same as the SMS/SMTP secret pattern.
  @IsOptional()
  @IsString()
  secret?: string;

  // enabled:false removes the provider's config (disables ingestion for it).
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
