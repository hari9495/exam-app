import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Assessments AS-0 (founder answer 2006): ending a candidate's attempt early needs a reason, kept on the candidate's
// record (a proctoring event the report shows) and in the audit log.
export class EndAttemptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/\S/, { message: 'Say why the attempt is being ended.' })
  reason!: string;
}

/** AS-5 (PRC-13): pausing or resuming from the live console needs a reason of 10+ characters the record keeps. */
export class PauseAttemptDto {
  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters.' })
  @MaxLength(500)
  @Matches(/\S{2,}/, { message: 'Give a reason of at least 10 characters.' })
  reason!: string;

  /** What the candidate is told while paused (otherwise a plain "your proctor paused the test"). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}

export class ResumeAttemptDto {
  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters.' })
  @MaxLength(500)
  reason!: string;
}
