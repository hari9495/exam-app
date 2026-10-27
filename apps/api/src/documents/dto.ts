import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class DocumentRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  personIds!: string[];

  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  typeKey!: string;
}

export class DocumentUploadDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiresOn?: string;
}

export class DocumentDecisionDto {
  @IsIn(['verify', 'reject'])
  decision!: 'verify' | 'reject';

  @IsOptional()
  @trim()
  @IsString()
  @Length(0, 500)
  reason?: string;

  @IsInt()
  version!: number;
}

export class DocumentFileQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  version?: number;
}

export class PersonDocsParamDto {
  @IsString()
  @MaxLength(40)
  typeKey!: string;
}

/** PPL-42 re-verification rules: dated, per legal entity (or the whole company when none). */
export class ReverificationRuleDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  typeKey!: string;

  @IsInt()
  @Min(1)
  @Max(120)
  everyMonths!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  designationIds?: string[];

  @IsOptional()
  @IsBoolean()
  onRoleChange?: boolean;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validFrom!: string;
}

export class ReverificationEndDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validTo?: string;
}

export class ReverificationAskDto {
  @IsUUID()
  ruleId!: string;

  @IsUUID()
  employeeId!: string;
}

export class DocumentShareDto {
  @IsIn(['letter', 'pay'])
  source!: 'letter' | 'pay';

  @IsUUID()
  id!: string;

  /** The employee picks how long the link works (the design offers 1, 7 or 30 days). */
  @IsInt()
  @IsIn([1, 7, 30])
  days!: 1 | 7 | 30;
}
