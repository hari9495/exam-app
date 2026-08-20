import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class DispatchWebhookDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsIn(['attempt.submitted', 'attempt.settled', 'integrity.flagged'])
  eventType!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
