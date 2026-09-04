import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePipelineSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoArchiveSiblingsOnHire?: boolean;
}
