import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const SIX_DIGITS = /^\d{6}$/;

// Sign-in with a one-time code, step 1. `identifier`: an email address or a mobile number (parsed
// and normalised by the service); `channel` picks SMS or WhatsApp for a mobile number.
export class OtpStartDto {
  @IsString() @MinLength(1) @MaxLength(100) organizationSlug!: string;
  @IsString() @MinLength(3) @MaxLength(320) identifier!: string;
  @IsOptional() @IsIn(['email', 'sms', 'whatsapp']) channel?: 'email' | 'sms' | 'whatsapp';
}

// Step 2: the same organisation and identifier, the token step 1 returned, and the code.
export class OtpVerifyDto {
  @IsString() @MinLength(1) @MaxLength(100) organizationSlug!: string;
  @IsString() @MinLength(3) @MaxLength(320) identifier!: string;
  @Matches(TOKEN) otpToken!: string;
  @Matches(SIX_DIGITS, { message: 'code must be the 6-digit code we sent you' }) code!: string;
}

// Fallback second factor: send a code for a pending sign-in (SMS / WhatsApp only, YX-IAM-03).
export class MfaOtpSendDto {
  @Matches(TOKEN) mfaToken!: string;
  @IsIn(['sms', 'whatsapp']) channel!: 'sms' | 'whatsapp';
}

export class MobileNumberDto {
  @IsString() @MinLength(5) @MaxLength(32) @Matches(/^[0-9+()\-. ]+$/) mobileNumber!: string;
  @IsOptional() @IsIn(['sms', 'whatsapp']) channel?: 'sms' | 'whatsapp';
}

export class MobileCodeDto {
  @Matches(SIX_DIGITS, { message: 'code must be the 6-digit code we sent you' }) code!: string;
}
