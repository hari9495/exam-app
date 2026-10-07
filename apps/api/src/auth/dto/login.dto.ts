import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  // Optional: exam / ATS clients and deep links name the company; the YukthiX sign-in does not
  // (the web address, the remembered company, or email-first across companies decides).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  organizationSlug?: string;

  // The work email, or (instead) `identifier`: an email address or a verified mobile number.
  @ValidateIf((o: LoginDto) => o.identifier === undefined)
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ValidateIf((o: LoginDto) => o.email === undefined)
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  identifier?: string;

  @IsString()
  @MinLength(1)
  // Generous (older accounts may predate the 128 cap) but bounded: argon2 work per attempt.
  @MaxLength(1024)
  password!: string;

  // Bot-challenge (Turnstile) token, when the challenge is configured (see bot-challenge.ts).
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  challengeToken?: string;
}

// YukthiX platform staff sign-in (POST /auth/platform/login): work email and password only.
export class PlatformLoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  challengeToken?: string;
}

// Step 1 of the YukthiX sign-in: only the email or mobile number. The answer says where to go
// next (the company's identity provider, or the password / code step) and nothing about accounts.
export class IdentifyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  identifier!: string;
}

// The person's credential matched accounts in several companies: which one to sign in to.
export class SelectCompanyDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  selectionToken!: string;

  // The company's id from the list (YukthiX staff are never on it: they use POST /auth/platform/login).
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/)
  organizationId!: string;
}
