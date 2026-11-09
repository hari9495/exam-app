import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

// T9-09 / Surfaces Careers page builder: the fixed section library only (no free-form HTML). Every text is plain text,
// rendered as text on the public page; the accent is a hex colour (the page drops it below 4.5:1 with white).
export const CAREERS_SECTION_TYPES = ['hero', 'about', 'values', 'benefits', 'jobs', 'locations', 'team', 'faq', 'footer'] as const;
export const CAREERS_THEMES = ['classic', 'compact', 'split'] as const;
const BENEFIT_ICONS = ['health', 'leave', 'learning', 'money', 'home', 'transport', 'meal', 'family'];

export class CareersItemDto {
  @IsOptional() @IsIn(BENEFIT_ICONS) icon?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) text?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(300) alt?: string;
  @IsOptional() @IsString() @MaxLength(200) caption?: string;
  @IsOptional() @IsString() @MaxLength(300) question?: string;
  @IsOptional() @IsString() @MaxLength(2000) answer?: string;
}

export class CareersSectionDto {
  @Matches(/^[a-z]+-\d{1,3}$|^[a-z]+$/) @MaxLength(20) id!: string;
  @IsIn(CAREERS_SECTION_TYPES) type!: (typeof CAREERS_SECTION_TYPES)[number];
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsBoolean() hidden?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @IsString() @MaxLength(300) photoAlt?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CareersItemDto) items?: CareersItemDto[];
}

export class CareersConfigDto {
  @IsIn(CAREERS_THEMES) theme!: (typeof CAREERS_THEMES)[number];
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Enter a 6-digit hex colour like #1F6F4A.' }) accent?: string | null;
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CareersSectionDto) sections!: CareersSectionDto[];
}

export class UpdateCareersDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(200) headline?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) intro?: string | null;
  @IsOptional() @IsBoolean() assistantEnabled?: boolean;
  /** The page builder's layout; its hero heading and text are also kept as the headline and intro. */
  @IsOptional() @ValidateNested() @Type(() => CareersConfigDto) config?: CareersConfigDto;
}
