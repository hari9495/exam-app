import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCareersDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(200) headline?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) intro?: string | null;
}
