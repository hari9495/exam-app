import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, Max, ValidateNested } from 'class-validator';

export class DripStepDto {
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(20000) body!: string;
  // Days to wait before sending this step, measured from the previous step (step 0 = from enrolment).
  @IsInt() @Min(0) @Max(365) delayDays!: number;
}

export class UpsertDripCampaignDto {
  @IsString() @MaxLength(200) name!: string;

  @IsOptional() @IsBoolean() enabled?: boolean;

  // A candidate global stage (e.g. 'available') that auto-enrols on entry; omit/empty = manual only.
  @IsOptional() @IsString() @MaxLength(50) targetGlobalStage?: string;

  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => DripStepDto)
  steps!: DripStepDto[];
}

export class EnrolCandidatesDto {
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true })
  candidateIds!: string[];
}
