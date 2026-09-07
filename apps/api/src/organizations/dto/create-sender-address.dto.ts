import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSenderAddressDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsEmail()
  @MaxLength(320)
  address!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
