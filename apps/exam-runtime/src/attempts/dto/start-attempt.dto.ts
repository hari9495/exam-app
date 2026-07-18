import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class StartAttemptDto {
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}
