import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class DispatchWebhookDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsIn(['attempt.settled'])
  eventType!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
