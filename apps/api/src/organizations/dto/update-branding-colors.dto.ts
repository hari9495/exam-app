import { IsBoolean, IsOptional, Matches } from 'class-validator';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export class UpdateBrandingColorsDto {
  @IsOptional()
  @Matches(HEX_COLOR_PATTERN, { message: 'primaryColor must be a 6-digit hex color, e.g. #1a73e8' })
  primaryColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR_PATTERN, { message: 'accentColor must be a 6-digit hex color, e.g. #1a73e8' })
  accentColor?: string;

  @IsOptional()
  @Matches(HEX_COLOR_PATTERN, { message: 'textColor must be a 6-digit hex color, e.g. #ffffff' })
  textColor?: string;

  @IsOptional()
  @IsBoolean()
  loginWatermarkEnabled?: boolean;
}
