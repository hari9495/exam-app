import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateHrisConfigDto {
  @IsBoolean()
  enabled!: boolean;

  // Only 'generic' today (a structured employee-record POST). Kept as an enum so payload-shape
  // presets can be added later without a breaking change.
  @IsOptional()
  @IsIn(['generic'])
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  targetUrl?: string;

  // The full Authorization header value to send (e.g. "Bearer xxx" or "Basic yyy"). Empty string
  // clears the stored token; omitted leaves it unchanged.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  authHeader?: string;
}
