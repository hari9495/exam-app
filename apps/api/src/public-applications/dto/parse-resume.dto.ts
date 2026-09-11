import { IsString, IsNotEmpty } from 'class-validator';

export class ParseResumeDto {
  @IsString() @IsNotEmpty() resumeBase64!: string;
}
