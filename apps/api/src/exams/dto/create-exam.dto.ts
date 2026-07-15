import { IsBoolean, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passCriteriaPercent?: number;

  @IsOptional()
  @IsBoolean()
  randomizeOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  schedulingEnabled?: boolean;

  @IsOptional()
  @IsISO8601()
  availabilityWindowStart?: string;

  @IsOptional()
  @IsISO8601()
  availabilityWindowEnd?: string;
}
