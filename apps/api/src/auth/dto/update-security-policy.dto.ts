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

  // One-time-code sign-in channels (AAL1); [] turns OTP sign-in off.
  @Present()
  @IsArray()
  @ArrayUnique()
  @IsIn(FLOOR.otpSignInChannels, { each: true })
  otpSignInChannels?: string[];

  // Account lockout (YX-IAM-07): lock on this consecutive failure (YukthiX: no later than the 10th) ...
  @Present()
  @IsInt()
  @Min(FLOOR.maxFailedAttempts.min)
  @Max(FLOOR.maxFailedAttempts.max)
  maxFailedAttempts?: number;

  // "Continue with Google / Microsoft" on the sign-in screen (off by default; SSO-only turns both off).
  @Present()
  @IsBoolean()
  googleSignIn?: boolean;

  @Present()
  @IsBoolean()
  microsoftSignIn?: boolean;

  // ... for this many minutes the first time (YukthiX: at least 15); repeat locks double, up to 24 h.
  @Present()
  @IsInt()
  @Min(FLOOR.lockMinutes.min)
  @Max(FLOOR.lockMinutes.max)
  lockMinutes?: number;
}
