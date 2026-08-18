import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateOfferDto {
  @IsString() compensation!: string;
  @IsDateString() startDate!: string;
  @IsDateString() expiresAt!: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
}
