import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateSsoSettingsDto {
  @IsOptional()
  @IsBoolean()
  samlEnabled?: boolean;

  @IsOptional()
  @IsString()
  samlIdpEntityId?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  samlIdpSsoUrl?: string;

  @IsOptional()
  @IsString()
  samlIdpCertificate?: string;
}
