import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateOfferTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** HIR-09 (founder decision 4): e-sign only when the template switches it on. */
  @IsOptional() @IsBoolean() esign?: boolean;
}
