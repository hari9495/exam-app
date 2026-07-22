import { IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsIpOrCidr } from './is-ip-or-cidr.decorator';

const FEEDBACK_VISIBILITY_VALUES = ['none', 'pass_fail', 'score', 'breakdown'] as const;

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
  @IsIn(FEEDBACK_VISIBILITY_VALUES)
  feedbackVisibility?: string;

  @IsOptional()
  @IsBoolean()
  schedulingEnabled?: boolean;

  @IsOptional()
  @IsISO8601()
  availabilityWindowStart?: string;

  @IsOptional()
  @IsISO8601()
  availabilityWindowEnd?: string;

  @IsOptional()
  @IsBoolean()
  walkInEnabled?: boolean;

  // '' means "clear the restriction" (stored as NULL); any other value must be a valid IP/CIDR.
  @IsOptional()
  @IsIpOrCidr()
  allowedIpRange?: string;
}
