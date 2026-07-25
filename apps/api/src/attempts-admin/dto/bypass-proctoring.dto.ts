import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class BypassProctoringDto {
  // Mandatory: an unexplained enforcement override on a hiring record is worse
  // than no override, because nobody can later tell why it was granted.
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/\S/, { message: 'reason must contain at least one non-whitespace character' })
  reason!: string;
}
