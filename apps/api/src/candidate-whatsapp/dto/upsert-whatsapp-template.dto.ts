import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpsertWhatsappTemplateDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(200) name!: string;
  // A PipelineStage id (org-defined, so no fixed IsIn set) or null for manual-only.
  @IsOptional() @ValidateIf((o) => o.triggerStageId !== null) @IsString() triggerStageId!: string | null;
  @IsIn(['manual', 'prompt', 'auto']) triggerMode!: string;
  @IsString() @MaxLength(4096) body!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
