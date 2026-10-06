import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { TENANT_SECURITY_FLOOR as FLOOR } from '@exam-platform/shared';

// Partial update of the company's security policy. Omitted = unchanged; null on a session field =
// back to the platform default. Every bound here is the YukthiX floor (a company may only be
// stricter); cross-field rules (idle <= absolute, valid CIDRs, break-glass accounts, not locking
// yourself out) are checked in SecurityPolicyService.
//
// Present = validated; only the session fields accept null (@IsOptional lets null through).
const Present = () => ValidateIf((_, value) => value !== undefined);

export class UpdateSecurityPolicyDto {
  @Present()
  @IsIn(FLOOR.mfaScopes)
  mfaScope?: string;

  @Present()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(FLOOR.factors, { each: true })
  allowedFactors?: string[];

  @IsOptional()
  @IsInt()
  @Min(FLOOR.sessionIdleMinutes.min)
  @Max(FLOOR.sessionIdleMinutes.max)
  sessionIdleMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(FLOOR.sessionAbsoluteMinutes.min)
  @Max(FLOOR.sessionAbsoluteMinutes.max)
  sessionAbsoluteMinutes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(FLOOR.maxConcurrentSessions.min)
  @Max(FLOOR.maxConcurrentSessions.max)
  maxConcurrentSessions?: number | null;

  @Present()
  @IsInt()
  @Min(FLOOR.passwordMinLength)
  @Max(FLOOR.passwordMaxLength)
  passwordMinLength?: number;

  @Present()
  @IsArray()
  @ArrayMaxSize(FLOOR.ipAllowlistMaxEntries)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ipAllowlistDesk?: string[];

  @Present()
  @IsArray()
  @ArrayMaxSize(FLOOR.ipAllowlistMaxEntries)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ipAllowlistAdmin?: string[];

  @Present()
  @IsArray()
  @ArrayMaxSize(FLOOR.ipAllowlistMaxEntries)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  ipAllowlistApi?: string[];

  @Present()
  @IsBoolean()
  ssoOnly?: boolean;

  @Present()
  @IsArray()
  @ArrayMaxSize(FLOOR.breakGlassAccounts.max)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  breakGlassUserIds?: string[];
}
