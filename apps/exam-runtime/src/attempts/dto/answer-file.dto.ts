import { IsString, MaxLength } from 'class-validator';

export class UploadAnswerFileDto {
  @IsString()
  questionId!: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  // base64 data URI; server enforces the real size cap after decode.
  @IsString()
  dataUri!: string;
}

export class RemoveAnswerFileDto {
  @IsString()
  questionId!: string;

  @IsString()
  fileId!: string;
}
