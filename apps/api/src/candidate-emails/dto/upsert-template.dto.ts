import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpsertTemplateDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(200) name!: string;
  // A PipelineStage id (org-defined, so no fixed IsIn set) or null for manual-only.
  @IsOptional() @ValidateIf((o) => o.triggerStageId !== null) @IsString() triggerStageId!: string | null;
  @IsIn(['manual', 'prompt', 'auto']) triggerMode!: string;
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
