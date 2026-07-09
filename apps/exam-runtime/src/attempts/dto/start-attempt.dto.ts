import { IsOptional, IsString } from 'class-validator';

export class StartAttemptDto {
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
