import { IsIn, IsString } from 'class-validator';

export class RelayAttemptStatusDto {
  @IsString()
  examId!: string;

  @IsString()
  attemptId!: string;

  @IsString()
  candidateId!: string;

  @IsIn(['submitted', 'auto_submitted', 'force_submitted'])
  status!: string;
}
