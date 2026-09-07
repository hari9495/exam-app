import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateOfferTemplateDto {
  @IsString() name!: string;
  @IsString() subject!: string;
  @IsString() body!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
