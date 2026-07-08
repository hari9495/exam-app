import { IsIn, IsObject, IsOptional } from 'class-validator';
import { CLIENT_REPORTABLE_EVENT_TYPES } from '../proctoring-severity';

export class ReportProctoringEventDto {
  @IsIn(CLIENT_REPORTABLE_EVENT_TYPES)
  eventType!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
