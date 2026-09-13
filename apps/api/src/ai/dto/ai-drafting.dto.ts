import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateJobDescriptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional() @IsString() @MaxLength(100)
  seniority?: string;

  @IsOptional() @IsString() @MaxLength(500)
  keySkills?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class GenerateOfferLetterDto {
  @IsOptional() @IsString() @MaxLength(200)
  salary?: string;

  @IsOptional() @IsString() @MaxLength(100)
  startDate?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class GenerateOutreachEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  intent!: string;

  @IsOptional() @IsString() @MaxLength(50)
  tone?: string;
}

class FunnelStageDto {
  @IsString() @MinLength(1) @MaxLength(120)
  name!: string;

  @IsInt() @Min(0)
  count!: number;
}

export class GenerateFunnelNarrativeDto {
  @IsOptional() @IsString() @MaxLength(200)
  jobTitle?: string;

  @IsOptional() @IsInt() @Min(0)
  totalCandidates?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FunnelStageDto)
  stages!: FunnelStageDto[];
}
