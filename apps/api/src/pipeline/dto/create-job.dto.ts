import { IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Min, MaxLength, MinLength, IsBoolean, IsNumber, Matches } from 'class-validator';

// schema.org / Google-for-Jobs employmentType enum (the values a valid JobPosting accepts).
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'TEMPORARY', 'INTERN', 'VOLUNTEER', 'PER_DIEM', 'OTHER'] as const;

export class CreateJobDto {
  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employmentType?: string;

  @IsOptional() @IsString() @MaxLength(200)
  department?: string;

  @IsOptional() @IsUUID()
  hiringManagerId?: string;

  @IsOptional() @IsInt() @Min(1)
  headcount?: number;

  @IsOptional() @IsInt()
  salaryMin?: number;

  @IsOptional() @IsInt()
  salaryMax?: number;

  @IsOptional() @IsString()
  salaryCurrency?: string;

  @IsOptional() @IsUUID()
  pipelineId?: string;

  @IsOptional() @IsObject()
  customFields?: Record<string, string | number | null>;

  /** M10 AT1: the P01 masters (YukthiX screens); each must belong to the company. */
  @IsOptional() @IsUUID()
  legalEntityId?: string | null;

  @IsOptional() @IsUUID()
  departmentId?: string | null;

  @IsOptional() @IsUUID()
  designationId?: string | null;

  @IsOptional() @IsUUID()
  gradeId?: string | null;

  @IsOptional() @IsUUID()
  locationId?: string | null;

  /** M10 AT2: the requisition's plan facts (checked on submit against the headcount plan). */
  @IsOptional() @IsUUID()
  headcountPlanLineId?: string | null;

  @IsOptional() @IsBoolean()
  outsidePlan?: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  outsidePlanReason?: string | null;

  @IsOptional() @IsIn(['new', 'replacement'])
  requisitionReason?: 'new' | 'replacement' | null;

  @IsOptional() @IsUUID()
  replacementOfEmployeeId?: string | null;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  budgetAmount?: number | null;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetStart?: string | null;
}
