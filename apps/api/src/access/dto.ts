import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { GRANT_SCOPE_TYPES } from '@exam-platform/shared';

// Request bodies for Roles & access (P02 §4.2–4.3, §4.6). Every field is whitelisted by the global pipe.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_SCOPE_TYPES = GRANT_SCOPE_TYPES.filter((t): t is Exclude<(typeof GRANT_SCOPE_TYPES)[number], 'one_report'> => t !== 'one_report');

export class FromTemplateDto {
  @IsString() @Matches(/^[a-z_]{2,40}$/)
  templateKey!: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;
}

export class GrantDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  permissionProfileId!: string;

  // One named report is granted only through a manager's pay access request (two HR approvals), never here.
  @IsIn(ADMIN_SCOPE_TYPES)
  scopeType!: (typeof ADMIN_SCOPE_TYPES)[number];

  /** The entity, location or department; omitted for the company and the report scopes. */
  @IsOptional() @IsUUID()
  scopeId?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(DATE, { message: 'validFrom is a date (YYYY-MM-DD)' })
  validFrom?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(DATE, { message: 'validTo is a date (YYYY-MM-DD)' })
  validTo?: string;

  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;

  /** YX-SEC-18: saving past the risk warnings is a deliberate, audited choice. */
  @IsOptional() @IsBoolean()
  confirmRisk?: boolean;
}

// Answer 946: a request from a "You don't have access" page.
export class AccessRequestAskDto {
  /** The page it was asked from (an app path; any query is dropped). */
  @IsString() @Matches(/^\/[A-Za-z0-9\-._~/[\]?=&%]{1,299}$/, { message: 'page is an app path' })
  page!: string;

  /** What the page calls itself ("payroll runs"). */
  @IsString() @MinLength(1) @MaxLength(200)
  what!: string;

  @IsString() @MinLength(10, { message: 'Say why you need access, in a sentence or more.' }) @MaxLength(500)
  reason!: string;

  @IsInt() @Min(1) @Max(366)
  days!: number;
}

export class AccessRequestMineDto {
  @IsString() @Matches(/^\/[A-Za-z0-9\-._~/[\]]{1,299}$/, { message: 'page is an app path' })
  page!: string;
}

/** Approving gives a role to the person who asked: Give access without choosing the person, always with a last day. */
export class AccessRequestApproveDto {
  @IsUUID()
  permissionProfileId!: string;

  @IsIn(ADMIN_SCOPE_TYPES)
  scopeType!: (typeof ADMIN_SCOPE_TYPES)[number];

  @IsOptional() @IsUUID()
  scopeId?: string;

  @IsOptional() @IsDateString({ strict: true }) @Matches(DATE, { message: 'validFrom is a date (YYYY-MM-DD)' })
  validFrom?: string;

  @IsDateString({ strict: true }) @Matches(DATE, { message: 'validTo is a date (YYYY-MM-DD)' })
  validTo!: string;

  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;

  @IsOptional() @IsBoolean()
  confirmRisk?: boolean;
}

export class GrantListDto {
  @IsOptional() @IsUUID()
  userId?: string;

  @IsOptional() @IsIn(['pending', 'active', 'rejected', 'revoked'])
  status?: string;
}

export class GrantDecisionDto {
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class GrantReasonDto {
  @IsString() @MinLength(1) @MaxLength(500)
  reason!: string;
}
