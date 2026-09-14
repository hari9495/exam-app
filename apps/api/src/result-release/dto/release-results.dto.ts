import { IsBoolean, IsOptional } from 'class-validator';

export class ReleaseResultsDto {
  // Whether to email candidates their outcome as part of releasing (recruiter's choice per release).
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}
