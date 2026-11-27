import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Projects P-1 (founder answers 1401 to 1405, 1412, 1420): the inputs of the projects API.
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const DATE = { strict: true } as const;

export const BILLING_MODELS = ['time_material', 'fixed_fee', 'retainer', 'non_billable'] as const;
export const PROJECT_STATUSES = ['draft', 'active', 'on_hold', 'closed'] as const;

export class ProjectInputDto {
  @trim()
  @Matches(/^[A-Z][A-Z0-9-]{0,11}$/, { message: 'A project code is 1 to 12 capital letters, digits or dashes, starting with a letter.' })
  code!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsUUID()
  managerUserId?: string | null;

  /** Answer 1403: the staffing desk's client (none for an internal, non-billable project). */
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  /** Answer 1444: left out on a new project, the company's default (projects.default_billing_model). */
  @IsOptional()
  @IsIn(BILLING_MODELS)
  billingModel?: (typeof BILLING_MODELS)[number];

  @IsOptional()
  @IsDateString(DATE)
  startOn?: string | null;

  @IsOptional()
  @IsDateString(DATE)
  endOn?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  budgetHours?: number | null;

  /** Projects finance only (answer 1412). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000_000)
  budgetCost?: number | null;

  /** Projects finance only (answer 1412). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000_000)
  fee?: number | null;

  /** Projects P-6 (1621): the time-and-material bill rate per hour in rupees (Projects finance only). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  billRate?: number | null;

  /** Answer 1420: the client accepts milestones in the portal (off by default). */
  @IsOptional()
  @IsBoolean()
  clientAcceptsMilestones?: boolean;

  /** Answer 1408: the client approves this project's hours in the client portal, line by line (off by default). */
  @IsOptional()
  @IsBoolean()
  clientApprovesHours?: boolean;

  /** Answer 1734: the client sees this project's timesheet notes in the portal (off by default). */
  @IsOptional()
  @IsBoolean()
  clientSeesNotes?: boolean;
}

export class ProjectUpdateDto extends ProjectInputDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ProjectStatusDto {
  @IsIn(PROJECT_STATUSES)
  status!: (typeof PROJECT_STATUSES)[number];

  @IsInt()
  @Min(1)
  version!: number;
}

export class AllocationDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  role?: string | null;

  @IsDateString(DATE)
  fromOn!: string;

  @IsOptional()
  @IsDateString(DATE)
  toOn?: string | null;

  @IsInt()
  @Min(1)
  @Max(100)
  percent!: number;

  @IsOptional()
  @IsBoolean()
  tentative?: boolean;
}

export class AllocationUpdateDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(80)
  role?: string | null;

  @IsDateString(DATE)
  fromOn!: string;

  @IsOptional()
  @IsDateString(DATE)
  toOn?: string | null;

  @IsInt()
  @Min(1)
  @Max(100)
  percent!: number;

  @IsOptional()
  @IsBoolean()
  tentative?: boolean;

  @IsInt()
  @Min(1)
  version!: number;
}

export class TaskDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  budgetHours?: number | null;

  @IsBoolean()
  billable!: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class MilestoneDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  pct!: number;

  @IsDateString(DATE)
  dueOn!: string;
}

export class VersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

class SettingChangeDto {
  @IsString()
  @MaxLength(100)
  key!: string;

  @IsString()
  @MaxLength(20)
  value!: string;
}

/** Settings 3.11: company-wide values. */
export class SaveProjectSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SettingChangeDto)
  changes!: SettingChangeDto[];
}

/** Projects P-3 (PRJ-08): a timesheet mapping rule. */
export class MappingRuleDto {
  @IsIn(['calendar', 'issues', 'code'])
  source!: 'calendar' | 'issues' | 'code';

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[^<>]*$/, { message: 'Write the pattern without < or >.' })
  pattern!: string;

  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  taskId?: string | null;

  @IsInt()
  @Min(1)
  @Max(999)
  priority!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class MappingRuleUpdateDto extends MappingRuleDto {
  @IsInt()
  @Min(1)
  version!: number;
}

// ---- Projects P-6 (PRJ-05, PRJ-06; answers 1414 to 1416) ----

export class BillingDraftDto {
  @IsUUID()
  seriesId!: string;

  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Give the month as YYYY-MM.' })
  month!: string;

  /** Workbench item ids (as the workbench lists them). */
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose the work to bill.' })
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  items!: string[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(60)
  po?: string;
}

export class CorrectionDto {
  /** The correct hours for the line's week. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(168)
  hours!: number;

  @trim()
  @IsString()
  @MinLength(3, { message: 'Enter why the hours change (3 characters at least).' })
  @MaxLength(300)
  reason!: string;
}

/** Batch D B3 (answer 2537): the Team tab's hours range. */
export class HoursRangeQueryDto {
  @IsOptional()
  @IsIn(['week', 'month', 'all'])
  range?: 'week' | 'month' | 'all';
}

/** T2-D 56 (2865): a task's new stage on the board. */
export class TaskStageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  stage!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

/** T2-D 56 (2866): who a task is assigned to (none clears it). */
export class TaskAssigneesDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  employeeIds!: string[];

  @IsInt()
  @Min(1)
  version!: number;
}

/** T2-D 58 and 59 (answers 2869, 2870): a project's own settings ('company' follows the company rule). */
export class ProjectOwnSettingsDto {
  @IsIn(['company', 'allocated', 'named'])
  bookingRule!: 'company' | 'allocated' | 'named';

  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  bookingEmployeeIds!: string[];

  @IsIn(['company', 'on', 'off'])
  notesRequired!: 'company' | 'on' | 'off';

  @IsIn(['company', 'on', 'off'])
  billableDefault!: 'company' | 'on' | 'off';

  @IsOptional()
  @IsUUID()
  secondApproverUserId?: string | null;

  @IsInt()
  @Min(1)
  version!: number;
}

/** T2-D 60 (2871): the hours reports' filters. */
export class HoursReportQueryDto {
  @IsIn(['person', 'task'])
  kind!: 'person' | 'task';

  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsIn(['csv'])
  format?: 'csv';
}
