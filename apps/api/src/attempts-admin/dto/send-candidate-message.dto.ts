import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendCandidateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
