import { IsDateString, IsString } from 'class-validator';

// Deliberately duplicates internal/dto/notify-message-sent.dto.ts's shape —
// this is the public app's relay-endpoint contract, decoupled from the
// internal app's own controller contract, not an accidental copy to collapse.
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
