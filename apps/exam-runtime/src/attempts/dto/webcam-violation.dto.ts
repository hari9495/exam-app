import { IsIn, IsOptional, IsString } from 'class-validator';

export const WEBCAM_VIOLATION_REASONS = ['no_face', 'head_turned', 'multiple_faces'] as const;
export type WebcamViolationReason = (typeof WEBCAM_VIOLATION_REASONS)[number];

export class WebcamViolationDto {
  @IsIn(WEBCAM_VIOLATION_REASONS)
  reason!: WebcamViolationReason;

  @IsString()
  snapshot!: string;

  // Screen capture (a base64 data URI), not the webcam snapshot above -- these are the
  // feature's motivating case: no_face/multiple_faces/webcam_head_turned strikes are the most
  // common machine misfire and previously carried no evidence of what was actually happening
  // on the candidate's screen.
  @IsOptional() @IsString()
  screenshot?: string;
}
