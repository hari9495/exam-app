import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PIPELINE_STAGES } from '../../pipeline/pipeline-stages';

const TRIGGER_EVENTS = [...PIPELINE_STAGES, 'rejected'];

export class UpsertTemplateDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @ValidateIf((o) => o.triggerEvent !== null) @IsIn(TRIGGER_EVENTS) triggerEvent!: string | null;
  @IsIn(['manual', 'prompt', 'auto']) triggerMode!: string;
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
