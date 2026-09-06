import { IsString, IsNotEmpty } from 'class-validator';

export class UploadPortalResumeDto {
  @IsString() @IsNotEmpty() resumeBase64!: string;
}
