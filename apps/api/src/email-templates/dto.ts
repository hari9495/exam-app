import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { WORDING_MAX } from '../email/email-wording';

// Plain text only; the service checks placeholders, links and markup per email type (email-wording.ts).
export class WordingDto {
  @IsString() @MaxLength(WORDING_MAX.subject) subject!: string;
  @IsString() @MaxLength(WORDING_MAX.heading) heading!: string;
  @IsString() @MaxLength(WORDING_MAX.intro) intro!: string;
  @IsString() @MaxLength(WORDING_MAX.buttonLabel) buttonLabel!: string;
  @IsString() @MaxLength(WORDING_MAX.footer) footer!: string;
}

const Nullable = () => ValidateIf((_, v) => v !== null);

export class BrandingDto {
  @IsBoolean() showLogo!: boolean;

  @Nullable()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Choose a colour like #1F6FEB' })
  accentColor!: string | null;

  @Nullable()
  @IsString()
  @MaxLength(60)
  senderName!: string | null;

  @Nullable()
  @IsEmail({ allow_display_name: false, allow_ip_domain: false, require_tld: true }, { message: 'Enter a valid email address' })
  @MaxLength(254)
  replyTo!: string | null;
}

/** A preview or a test of unsaved changes: the draft wording, and the draft branding when it is being changed. */
export class DraftDto {
  @ValidateNested() @Type(() => WordingDto) wording!: WordingDto;
  @IsOptional() @ValidateNested() @Type(() => BrandingDto) branding?: BrandingDto;
}
