import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { SMS_PROVIDER_IDS } from '../../sms/providers';

export class UpdateSmsConfigDto {
  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsIn(SMS_PROVIDER_IDS)
  smsProvider?: string;

  // Provider-shaped config blob (fields defined by that provider's configFields).
  // Loosely validated here -- the selected adapter's validateConfig does the real
  // per-field validation server-side. Write-only for secret fields: blank/absent
  // keeps the existing encrypted value (see OrganizationsService.putSmsConfig).
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
