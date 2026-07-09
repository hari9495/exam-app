import { IsDateString, IsString } from 'class-validator';

export class RelayMessageSentDto {
  @IsString()
  examId!: string;

  @IsString()
  attemptId!: string;

  @IsString()
  candidateId!: string;

  @IsDateString()
  sentAt!: string;
}
