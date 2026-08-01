import { IsString } from 'class-validator';

export class ScreenAnalysisDto {
  // JPEG data URI of the candidate's shared monitor, captured by useScreenCapture.
  @IsString()
  screenshot!: string;
}
