import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PIPELINE_STAGES } from '../pipeline-stages';

export class PatchEntryDto {
  @IsOptional() @IsIn(PIPELINE_STAGES as unknown as string[]) stage?: string;
  @IsOptional() @IsBoolean() rejected?: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
