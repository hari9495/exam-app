import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsIpOrCidr } from './is-ip-or-cidr.decorator';

const FEEDBACK_VISIBILITY_VALUES = ['none', 'pass_fail', 'score', 'breakdown'] as const;

export const PROCTORING_ENFORCEMENT_VALUES = ['warn', 'block'] as const;

// Exactly the strike-worthy browser signals. Webcam signals are governed by
// webcamProctoringEnabled; editor_paste/refresh_warning are telemetry, not strikes.
export const TOGGLEABLE_PROCTORING_SIGNALS = [
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'multi_monitor_detected',
  'idle_timeout',
] as const;

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

  @IsOptional()
  @IsBoolean()
  webcamProctoringEnabled?: boolean;

  @IsOptional()
  @IsIn(PROCTORING_ENFORCEMENT_VALUES)
  proctoringEnforcement?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  proctoringStrikeLimit?: number;

  // An empty array explicitly means "watch every signal" and clears the column.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(TOGGLEABLE_PROCTORING_SIGNALS, { each: true })
  disabledProctoringSignals?: string[];

  @IsOptional()
  @IsBoolean()
  screenCaptureEnabled?: boolean;
}
