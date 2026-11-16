import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

// Assessments AS-0 (founder answer 2006): ending a candidate's attempt early needs a reason, kept on the candidate's
// record (a proctoring event the report shows) and in the audit log.
export class EndAttemptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/\S/, { message: 'Say why the attempt is being ended.' })
  reason!: string;
}
