import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { CLAUSES_MAX, CLAUSE_TEXT_MAX, NOTES_MAX, PATTERNS, POLICY_TYPES, STATES, type PolicyType } from './policy-writer-rules';

// HLP-14 inputs. Whitelisted by the global ValidationPipe (unknown fields are refused); every answer is a fixed choice
// or a capped number except the optional notes, which are capped and checked for personal data before the AI sees them.

const Num = (max: number) => (target: object, key: string) => {
  IsOptional()(target, key);
  IsInt()(target, key);
  Min(0)(target, key);
  Max(max)(target, key);
};

/** The numbers (only those of the chosen policy type are used; ranges per type are checked again by the service). */
export class WriterValuesDto {
  @Num(60) earned?: number;
  @Num(30) sick?: number;
  @Num(30) casual?: number;
  @Num(300) carry?: number;
  @Num(5) wfhDays?: number;
  @Num(180) noticeDays?: number;
  @Num(12) probationMonths?: number;
  @Num(20) icMembers?: number;
  @Num(20) womenMembers?: number;
}

export class GenerateDto extends WriterValuesDto {
  @IsIn(['ai', 'starter'])
  mode!: 'ai' | 'starter';

  @IsIn(POLICY_TYPES)
  type!: PolicyType;

  /** A code from the industry table (checked again by the service against the active list). */
  @Matches(/^[a-z][a-z0-9_]{1,29}$/)
  industry!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one state where people work.' })
  @ArrayMaxSize(36)
  @ArrayUnique()
  @IsIn(Object.keys(STATES), { each: true })
  states!: string[];

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  headcount!: number;

  @IsIn(Object.keys(PATTERNS))
  workPattern!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(NOTES_MAX, { message: `Keep the notes to ${NOTES_MAX} characters.` })
  notes?: string;
}

export class ClauseEditDto {
  @Matches(/^p\d{1,2}$/)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(CLAUSE_TEXT_MAX)
  text!: string;
}

export class SaveDraftDto extends WriterValuesDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CLAUSES_MAX)
  @ValidateNested({ each: true })
  @Type(() => ClauseEditDto)
  clauses?: ClauseEditDto[];
}

export class ApproveDraftDto {
  @IsInt()
  @Min(1)
  version!: number;
}
