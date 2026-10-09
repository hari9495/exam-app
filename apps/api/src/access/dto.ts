import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { GRANT_SCOPE_TYPES } from '@exam-platform/shared';

// Request bodies for Roles & access (P02 §4.2–4.3, §4.6). Every field is whitelisted by the global pipe.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  @IsIn(GRANT_SCOPE_TYPES)
  scopeType!: (typeof GRANT_SCOPE_TYPES)[number];

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
