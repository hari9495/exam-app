import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class UpdateScheduledReportSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  recipientUserIds?: string[];
}
