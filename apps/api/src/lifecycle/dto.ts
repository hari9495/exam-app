import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const OWNERS = ['hr', 'it', 'admin', 'finance', 'payroll', 'manager', 'person', 'user', 'group', 'buddy'] as const;
const KINDS = ['tick', 'form', 'document', 'letter', 'desk_request'] as const;

export class TemplateTaskDto {
  @Matches(/^[a-z][a-z0-9_]{0,39}$/)
  key!: string;

  @trim()
  @IsString()
  @Length(1, 150)
  title!: string;

  @IsIn(OWNERS)
  ownerType!: (typeof OWNERS)[number];

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerGroupId?: string | null;

  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsInt()
  @Min(-90)
  @Max(180)
  dueOffsetDays!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z][a-z0-9_]{0,39}$/, { each: true })
  dependsOn?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  locked?: boolean;
}

export class TemplateDto {
  @IsIn(['onboarding', 'offboarding'])
  kind!: 'onboarding' | 'offboarding';

  @trim()
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsInt()
  version?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => TemplateTaskDto)
  tasks!: TemplateTaskDto[];
}

export class StarterDto {
  @Matches(/^[a-z][a-z0-9_]{0,39}$/)
  starterKey!: string;
}

export class JoinerDto {
  @trim()
  @IsString()
  @Length(1, 100)
  givenName!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  familyName?: string | null;

  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  /** HR confirmed an existing person (YX-ORG-27). */
  @IsOptional()
  @IsUUID()
  personId?: string;

  @Matches(ISO)
  joiningOn!: string;

  @IsUUID()
  legalEntityId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  designationId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string | null;

  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  /** Lifecycle 6e: the campus batch. */
  @IsOptional()
  @IsUUID()
  batchId?: string | null;
}

export class JoinerImportDto {
  @IsString()
  @MaxLength(262_144)
  csv!: string;

  @IsBoolean()
  commit!: boolean;

  @IsOptional()
  @IsUUID()
  templateId?: string | null;
}

export class PostponeDto {
  @Matches(ISO)
  joiningOn!: string;

  @trim()
  @IsString()
  @Length(3, 300)
  reason!: string;

  @IsInt()
  version!: number;
}

export class CompleteTaskDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class SkipTaskDto {
  @IsInt()
  version!: number;

  @trim()
  @IsString()
  @Length(3, 300)
  reason!: string;
}

export class ReassignTaskDto {
  @IsInt()
  version!: number;

  @IsUUID()
  userId!: string;
}

export class PlanDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  designationId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

  @IsOptional()
  @IsUUID()
  managerEmployeeId?: string | null;

  @IsInt()
  version!: number;
}

export class JoinDto {
  @IsBoolean()
  identityAttested!: boolean;

  @IsIn(['probation', 'confirmed'])
  status!: 'probation' | 'confirmed';

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(254)
  workEmail?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @Length(1, 30)
  employeeCode?: string | null;

  @IsInt()
  version!: number;
}

export class CancelJoinerDto {
  @IsIn(['did_not_join', 'reneged', 'withdrawn'])
  outcome!: 'did_not_join' | 'reneged' | 'withdrawn';

  @trim()
  @IsString()
  @Length(3, 500)
  reason!: string;

  @IsInt()
  version!: number;
}

export class BgvCheckDto {
  @IsIn(['identity', 'address', 'education', 'employment', 'criminal', 'reference', 'credit'])
  checkType!: string;

  @IsIn(['none', 'before_joining', 'before_confirmation'])
  gate!: string;
}

export class BgvUpdateDto {
  @IsIn(['in_progress', 'clear', 'discrepancy', 'unable'])
  status!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsIn(['none', 'before_joining', 'before_confirmation'])
  gate?: string;

  @Transform(({ value }) => (typeof value === 'string' ? Number(value) : value))
  @IsInt()
  version!: number;
}
