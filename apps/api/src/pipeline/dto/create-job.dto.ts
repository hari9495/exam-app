import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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

  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000)
  salaryMin?: number;

  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000)
  salaryMax?: number;

  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, { message: 'Currency is three capital letters, for example INR.' })
  salaryCurrency?: string;

  /** M10 AT3: show the salary range on the careers site and in Google for Jobs. */
  @IsOptional() @IsBoolean()
  showSalary?: boolean;

  /**
   * HIR-03 answer 244: the country (ISO, two letters) of a free-text place. Outside India the place must come from the
   * company's locations instead, so a free-text place with another country is refused. Not stored.
   */
  @IsOptional() @Matches(/^[A-Z]{2}$/, { message: 'Country is two capital letters, for example IN.' })
  locationCountry?: string;

  /** HIR-03 answer 222: the job's recruiter (a staff member of the company); default the person who opens it. */
  @IsOptional() @IsUUID()
  recruiterUserId?: string;

  /** HIR-24: the period of the pay range. */
  @IsOptional() @IsIn(['year', 'month', 'hour'])
  salaryPeriod?: 'year' | 'month' | 'hour';

  /** HIR-24: the application asks about current or past pay (refused where the location's law bans it). */
  @IsOptional() @IsBoolean()
  askPayHistory?: boolean;

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

  /** Enterprise E1 (O4): the seat the requisition is raised against (positions on); its open headcount caps the openings. */
  @IsOptional() @IsUUID()
  positionId?: string | null;

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

  /** Careers answer 353: the last day to apply (YYYY-MM-DD); applications close after it. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  applyBy?: string | null;

  /** Careers answer 353: the experience asked for, as candidates read it ("2 to 4 years"). */
  @IsOptional() @IsString() @MaxLength(60)
  experience?: string | null;
}

/**
 * PPL-08 "Request a hire": a manager with ats.requisition.raise asks for a hire for their team. Only the request's facts:
 * the job's place comes from the plan line, the manager is the hiring manager, and it always goes for approval.
 */
export class RaiseRequisitionDto {
  @IsString() @MinLength(1) @MaxLength(200)
  title!: string;

  @IsIn(['new', 'replacement'])
  requisitionReason!: 'new' | 'replacement';

  @IsOptional() @IsUUID()
  headcountPlanLineId?: string | null;

  /** Enterprise E1 (O4): the seat the requisition is raised against (positions on); its open headcount caps the openings. */
  @IsOptional() @IsUUID()
  positionId?: string | null;

  @IsOptional() @IsBoolean()
  outsidePlan?: boolean;

  @IsOptional() @IsString() @MaxLength(1000)
  outsidePlanReason?: string | null;

  @IsOptional() @IsUUID()
  replacementOfEmployeeId?: string | null;

  @IsInt() @Min(1) @Max(20)
  headcount!: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  budgetAmount?: number | null;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetStart?: string | null;

  /** Careers answer 353: the last day to apply (YYYY-MM-DD); applications close after it. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  applyBy?: string | null;

  /** Careers answer 353: the experience asked for, as candidates read it ("2 to 4 years"). */
  @IsOptional() @IsString() @MaxLength(60)
  experience?: string | null;
}
