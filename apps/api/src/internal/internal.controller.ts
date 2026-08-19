import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IntegrationEventType } from '@exam-platform/shared';
import { InternalAuthGuard } from './internal-auth.guard';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { DispatchWebhookDto } from './dto/dispatch-webhook.dto';

@Controller('internal/webhooks')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(private readonly integrationEvents: IntegrationEventsService) {}

  @Post('dispatch')
  @HttpCode(204)
  async dispatch(@Body() dto: DispatchWebhookDto): Promise<void> {
    await this.integrationEvents.emit(dto.organizationId, dto.eventType as IntegrationEventType, dto.data);
  }
}
