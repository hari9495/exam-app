import { IsUUID } from 'class-validator';

export class LinkExamDto {
  @IsUUID() examId!: string;
}
