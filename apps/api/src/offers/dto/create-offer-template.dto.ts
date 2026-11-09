import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateOfferTemplateDto {
  @IsString() name!: string;
  @IsString() subject!: string;
  @IsString() body!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** HIR-09 (founder decision 4): e-sign only when the template switches it on. */
  @IsOptional() @IsBoolean() esign?: boolean;
}
