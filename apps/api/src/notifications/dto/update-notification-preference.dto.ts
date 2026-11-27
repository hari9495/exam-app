import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsString() type!: string;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  /** T2-E 52 (2877): push for this kind. */
  @IsOptional() @IsBoolean() pushEnabled?: boolean;
}
