import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ScreenShareStateDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional() @IsString() @MaxLength(50)
  displaySurface?: string;

  @IsOptional() @IsString() @MaxLength(400)
  userAgent?: string;
}
