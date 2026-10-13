import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBase64, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

// Public, unauthenticated (M10 AT3: an untrusted boundary). Every field is bounded; text that is shown to recruiters
// carries no markup or control characters; the résumé is capped before decoding (5 MB PDF ≈ 6.7 MB of base64).

export class ConsentAcceptDto {
  @IsIn(['application', 'talent_pool'])
  purpose!: 'application' | 'talent_pool';

  @IsInt()
  @Min(1)
  @Max(100000)
  version!: number;
}

export class ApplyDto {
  @IsString() @MinLength(1) @MaxLength(200)
  @Matches(/^[^<>\u0000-\u001f\u007f]+$/, { message: 'Use letters, spaces and ordinary punctuation in your name.' })
  name!: string;

  @IsEmail() @MaxLength(254) email!: string;

  @IsOptional() @IsString() @MaxLength(30)
  @Matches(/^[+0-9 ()-]{5,30}$/, { message: 'Enter a phone number with digits, spaces, + ( ) or -.' })
  phone?: string;

  @IsBase64() @MaxLength(7_000_000) resumeBase64!: string;

  @IsOptional() @IsObject() customFields?: Record<string, string | number | null>;

  /** Older apply page: one tick for the application notice. */
  @IsOptional() @IsBoolean() consentAccepted?: boolean;

  /** The notices accepted, each at the version shown (M10 AT3). */
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => ConsentAcceptDto)
  consents?: ConsentAcceptDto[];

  /** Honeypot: a field people never see. A bot that fills it is answered as if it applied, and nothing is stored. */
  @IsOptional() @IsString() @MaxLength(500) website?: string;
}
