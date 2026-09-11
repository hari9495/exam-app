import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateSmsConfigDto {
  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsString()
  smsAccountSid?: string;

  @IsOptional()
  @IsString()
  smsFromNumber?: string;

  // Write-only, like the SMTP password: present + non-blank -> encrypt and store;
  // omitted or blank/whitespace -> leave the existing encrypted token untouched.
  @IsOptional()
  @IsString()
  smsAuthToken?: string;
}
