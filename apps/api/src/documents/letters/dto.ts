import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const bool = () => Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value));
const LETTER_TYPE = /^[a-z][a-z0-9_]{1,39}$/;

export class TemplateUploadDto {
  @Matches(LETTER_TYPE, { message: 'letterType is lower-case letters, digits and _' })
  letterType!: string;

  @trim()
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @bool()
  @IsBoolean()
  requiresApproval!: boolean;

  @bool()
  @IsBoolean()
  personSigns!: boolean;

  @IsOptional()
  @bool()
  @IsBoolean()
  companyDsc?: boolean;
}

export class StarterLetterDto {
  @Matches(LETTER_TYPE)
  letterType!: string;
}

export class SignatoryDto {
  @IsUUID()
  legalEntityId!: string;

  @IsUUID()
  userId!: string;

  @trim()
  @IsString()
  @Length(2, 100)
  title!: string;
}

export class LetterPreviewDto {
  @Matches(LETTER_TYPE)
  letterType!: string;

  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsUUID()
  signatoryId?: string | null;
}

export class IssueLetterDto extends LetterPreviewDto {
  @IsOptional()
  @IsIn(['preboarding', 'employment', 'exit_case'])
  subjectType?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  supersedesId?: string | null;
}

export class LetterFileQueryDto {
  @IsOptional()
  @IsIn(['letter', 'acceptance'])
  which?: 'letter' | 'acceptance';
}

export class SignLetterDto {
  @Matches(/^[0-9]{6}$/, { message: 'Enter the 6-digit code.' })
  code!: string;

  @IsBoolean()
  accept!: boolean;

  @IsOptional()
  @IsBoolean()
  disclosureAccepted?: boolean;
}

// ---- Lifecycle batch 6e: the editor tab (PPL-29) and the bulk wizard (PPL-28) ----

export class ComposeParagraphDto {
  @IsString()
  @MaxLength(2000)
  text!: string;

  @IsOptional()
  @IsBoolean()
  bold?: boolean;

  @IsOptional()
  @IsBoolean()
  heading?: boolean;
}

export class ComposeTemplateDto {
  @Matches(LETTER_TYPE)
  letterType!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsBoolean()
  requiresApproval!: boolean;

  @IsBoolean()
  personSigns!: boolean;

  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => ComposeParagraphDto)
  paragraphs!: ComposeParagraphDto[];
}

export class BulkLetterDto {
  @Matches(LETTER_TYPE)
  letterType!: string;

  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  personIds!: string[];
}
