import { IsDateString, IsString } from 'class-validator';

export class NotifyMessageSentDto {
  @IsString()
  examId!: string;

  @IsString()
  attemptId!: string;

  @IsString()
  candidateId!: string;

  @IsDateString()
  sentAt!: string;
}
