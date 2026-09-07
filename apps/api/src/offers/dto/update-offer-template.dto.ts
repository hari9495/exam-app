import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateOfferTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
