import { IsNotEmpty, IsString } from 'class-validator';

export class BulkUploadInviteDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}
