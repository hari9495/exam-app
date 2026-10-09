import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmptyObject,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

// WebAuthn JSON (as @simplewebauthn/browser produces it): base64url strings, bounded. The
// library does the cryptographic validation; these only bound the shape and size.
const B64URL = /^[A-Za-z0-9_-]*$/;
const B64URL_MAX = 16_384;

class AssertionResponseDto {
  @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) clientDataJSON!: string;
  @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) authenticatorData!: string;
  @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) signature!: string;
  @IsOptional() @IsString() @Matches(B64URL) @MaxLength(1024) userHandle?: string;
}

class AttestationResponseDto {
  @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) clientDataJSON!: string;
  @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) attestationObject!: string;
  @IsOptional() @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) authenticatorData?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(32, { each: true }) transports?: string[];
  @IsOptional() @IsNumber() publicKeyAlgorithm?: number;
  @IsOptional() @IsString() @Matches(B64URL) @MaxLength(B64URL_MAX) publicKey?: string;
}

class CredentialBaseDto {
  @IsString() @Matches(B64URL) @MinLength(1) @MaxLength(1024) id!: string;
  @IsString() @Matches(B64URL) @MinLength(1) @MaxLength(1024) rawId!: string;
  @IsIn(['public-key']) type!: 'public-key';
  @IsObject() clientExtensionResults!: Record<string, unknown>;
  @IsOptional() @IsIn(['platform', 'cross-platform']) authenticatorAttachment?: 'platform' | 'cross-platform';
}

export class PasskeyAssertionDto extends CredentialBaseDto {
  @ValidateNested() @Type(() => AssertionResponseDto) @IsNotEmptyObject() response!: AssertionResponseDto;
}

export class PasskeyAttestationDto extends CredentialBaseDto {
  @ValidateNested() @Type(() => AttestationResponseDto) @IsNotEmptyObject() response!: AttestationResponseDto;
}

export const MFA_FACTORS = ['totp', 'passkey', 'recovery_code'] as const;
export type MfaFactor = (typeof MFA_FACTORS)[number];

// The proof fields shared by step-up and the sign-in second step; `factor` is set by each.
class ProofFieldsDto {
  factor!: string;

  // TOTP: 6 digits; recovery code: xxxx-xxxx-xxxx-xxxx (case and dashes forgiven). The service
  // checks which.
  @ValidateIf((o: ProofFieldsDto) => o.factor !== 'passkey')
  @IsString()
  @Matches(/^[A-Za-z0-9 -]{6,40}$/)
  code?: string;

  @ValidateIf((o: ProofFieldsDto) => o.factor === 'passkey')
  @ValidateNested()
  @Type(() => PasskeyAssertionDto)
  @IsNotEmptyObject()
  credential?: PasskeyAssertionDto;
}

// A second-factor proof: a 6-digit TOTP code, a recovery code, or a passkey assertion (step-up
// never accepts a one-time code, YX-IAM-03).
export class MfaProofDto extends ProofFieldsDto {
  @IsIn(MFA_FACTORS)
  factor!: MfaFactor;
}

// The pending-sign-in token from the password / SSO step (never a session).
export class MfaTokenDto {
  @IsString() @Matches(B64URL) @MinLength(43) @MaxLength(43) mfaToken!: string;
}

// The sign-in second step also takes the fallback one-time code (factor 'otp', 6 digits).
export const MFA_LOGIN_FACTORS = [...MFA_FACTORS, 'otp'] as const;

export class MfaLoginDto extends ProofFieldsDto {
  @IsIn(MFA_LOGIN_FACTORS)
  factor!: (typeof MFA_LOGIN_FACTORS)[number];

  @IsString() @Matches(B64URL) @MinLength(43) @MaxLength(43) mfaToken!: string;
}

export class ConfirmTotpDto {
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit code from your authenticator app' }) code!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) label?: string;
}

export class RegisterPasskeyDto {
  @ValidateNested() @Type(() => PasskeyAttestationDto) @IsNotEmptyObject() credential!: PasskeyAttestationDto;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) label?: string;
}

export class RequestMfaResetDto {
  @IsUUID() userId!: string;
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

// "Sign in with a passkey" (passwordless): the assertion alone; the challenge is read from it.
export class PasskeySignInDto {
  @ValidateNested() @Type(() => PasskeyAssertionDto) @IsNotEmptyObject() credential!: PasskeyAssertionDto;
}

export class RenamePasskeyDto {
  @IsString() @MinLength(1) @MaxLength(64) @Matches(/\S/) label!: string;
}
