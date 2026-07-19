import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';
import { WebhooksService } from '../webhooks/webhooks.service';
import { DispatchWebhookDto } from './dto/dispatch-webhook.dto';

@Controller('internal/webhooks')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('dispatch')
  @HttpCode(204)
  async dispatch(@Body() dto: DispatchWebhookDto): Promise<void> {
    await this.webhooksService.enqueue(dto.organizationId, dto.eventType, dto.data);
  }
}
