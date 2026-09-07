import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSenderAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
