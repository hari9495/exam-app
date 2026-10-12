import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateIf } from 'class-validator';
import { LANGUAGES, type Language } from './country-pack';
import { SUBJECT_TYPES, type SubjectType } from './global-data';

// Batch G1 request bodies. Every field is whitelisted by the global pipe.

export class LanguageDto {
  @IsIn(LANGUAGES)
  language!: Language;
}

export class TranslationQueryDto {
  @IsIn(SUBJECT_TYPES)
  subjectType!: SubjectType;
}

export class TranslationDto {
  @IsIn(SUBJECT_TYPES)
  subjectType!: SubjectType;

  @IsUUID()
  subjectId!: string;

  @IsIn(LANGUAGES)
  language!: Language;

  /** null (or blank) removes the translation: the company's own words show again. */
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(150)
  text!: string | null;
}

export class CountrySetupDto {
  @Matches(/^[A-Z]{2}$/, { message: 'country is a two-letter country code' })
  country!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}

export class CountrySetupEntityDto {
  @IsUUID()
  legalEntityId!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

export class VersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}
