import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

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
