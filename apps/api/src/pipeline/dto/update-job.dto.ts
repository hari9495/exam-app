import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength, MinLength } from 'class-validator';
import { EMPLOYMENT_TYPES } from './create-job.dto';

export class UpdateJobDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsIn(EMPLOYMENT_TYPES as unknown as string[])
  employmentType?: string;

  @IsOptional() @IsIn(['open', 'closed'])
  status?: 'open' | 'closed';

  @IsOptional() @IsBoolean()
  publicApplyEnabled?: boolean;

  @IsOptional() @IsString() @MaxLength(5000)
  fitCriteria?: string;

  @IsOptional() @IsArray()
  fitRubric?: { label: string; weight: number }[];

  @IsOptional() @IsString() @MaxLength(200)
  department?: string;

  @IsOptional() @IsUUID()
  hiringManagerId?: string;

  @IsOptional() @IsInt() @Min(1)
  headcount?: number;

  @IsOptional() @IsInt()
  salaryMin?: number;

  @IsOptional() @IsInt()
  salaryMax?: number;

  @IsOptional() @IsString()
  salaryCurrency?: string;
}
