import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

// Helpdesk ITSM inputs (docs/yukthix/helpdesk-itsm-plan.md). The risk questions are JSON checked by questionsProblem.

const ROUTES = ['lead', 'lead_owner', 'board'] as const;
const HHMM = /^([01]\d|2[0-3]):[03]0$/;

/** ITSM-1: an IT desk's change and problem settings (answers 1933-1939). Absent fields stay as they are. */
export class ItsmSettingsDto {
  @IsInt()
  @Min(0)
  version!: number;

  /** null: back to the five starter questions. */
  @IsOptional()
  riskQuestions?: unknown;

  @IsOptional()
  @IsIn(ROUTES)
  routeLow?: (typeof ROUTES)[number];

  @IsOptional()
  @IsIn(ROUTES)
  routeMedium?: (typeof ROUTES)[number];

  @IsOptional()
  @IsIn(ROUTES)
  routeHigh?: (typeof ROUTES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('all', { each: true })
  boardUserIds?: string[];

  @IsOptional()
  @IsIn(['majority', 'all'])
  boardRule?: 'majority' | 'all';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  emergencyReviewDays?: number;

  @IsOptional()
  @IsBoolean()
  bannerOn?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  bannerHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  reviewDays?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  repeatCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  repeatDays?: number;
}

/** ITSM-1, answer 1936: the company's change window and freeze days (company settings itsm.*). */
export class ItsmWindowDto {
  @IsOptional()
  @Matches(HHMM, { message: 'Use a time on the hour or half hour, such as 20:00.' })
  weekdayFrom?: string;

  @IsOptional()
  @Matches(HHMM, { message: 'Use a time on the hour or half hour, such as 06:00.' })
  weekdayTo?: string;

  @IsOptional()
  @IsBoolean()
  weekends?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  freezeFirstDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  freezeLastDays?: number;

  /** Dates of the month, "7, 15, 20" (checked in the service). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  freezeDates?: string;
}

const RISKS = ['low', 'medium', 'high'] as const;

/** ITSM-2: a new change (answers 1932-1936). The service checks the rules against the desk's settings. */
export class ChangeDto {
  @IsUUID()
  deskId!: string;

  @IsIn(['standard', 'normal', 'emergency'])
  kind!: 'standard' | 'normal' | 'emergency';

  @IsString()
  @MinLength(5)
  @MaxLength(200)
  title!: string;

  /** The business application it touches (its owner may approve), or a service named in words. */
  @IsOptional()
  @IsUUID()
  appId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  /** A standard change: the pre-approved template. */
  @IsOptional()
  @IsUUID()
  templateId?: string;

  /** Question id to the chosen answer's points ('0' to '2'). */
  @IsOptional()
  @IsObject()
  answers?: Record<string, string>;

  /** A risk other than the answers give; lower needs riskReason. */
  @IsOptional()
  @IsIn(RISKS)
  risk?: (typeof RISKS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  riskReason?: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  freezeReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  plan?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  backout!: string;

  @IsOptional()
  @IsBoolean()
  banner?: boolean;

  /** Implementation steps (a standard change takes its template's checklist). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  tasks?: string[];
}

export class ChangeVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ChangeTasksDto extends ChangeVersionDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsBoolean({ each: true })
  done!: boolean[];
}

export class ChangeOutcomeDto extends ChangeVersionDto {
  @IsIn(['done', 'done_with_problems', 'backed_out'])
  outcome!: 'done' | 'done_with_problems' | 'backed_out';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ChangeReviewDto extends ChangeVersionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  review!: string;
}

export class ChangesQueryDto {
  @IsOptional()
  @IsUUID()
  deskId?: string;
}

/** Answer 1943: the change audit export for a period (India dates), as CSV or PDF. */
export class ChangeExportDto {
  @IsUUID()
  deskId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsIn(['csv', 'pdf'])
  format!: 'csv' | 'pdf';
}
