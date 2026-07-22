import { IsIn, IsString } from 'class-validator';

export const WEBCAM_VIOLATION_REASONS = ['no_face', 'head_turned', 'multiple_faces'] as const;
export type WebcamViolationReason = (typeof WEBCAM_VIOLATION_REASONS)[number];

export class WebcamViolationDto {
  @IsIn(WEBCAM_VIOLATION_REASONS)
  reason!: WebcamViolationReason;

  @IsString()
  snapshot!: string;
}
