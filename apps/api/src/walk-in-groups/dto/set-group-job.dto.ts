import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class SetGroupJobDto {
  // jobId is either a UUID (link) or explicitly null (unlink).
  @ValidateIf((o) => o.jobId !== null)
  @IsUUID()
  jobId!: string | null;
}
