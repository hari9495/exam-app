import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService, IntegrationEventType } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { INTEGRATION_DELIVERIES_QUEUE } from '../jobs/integration-deliveries.queue';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };
const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } as const };

@Injectable()
export class IntegrationEventsService {
  private readonly logger = new Logger(IntegrationEventsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly webhooksService: WebhooksService,
    @Inject(INTEGRATION_DELIVERIES_QUEUE) private readonly queue: Queue,
  ) {}

  // Call POST-COMMIT, outside any forTenant write transaction. Never throws to the caller --
  // a notification failure must not roll back or break the domain operation that triggered it.
  async emit(organizationId: string, eventType: IntegrationEventType, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.webhooksService.enqueue(organizationId, eventType, payload);
    } catch (e) {
      this.logger.error(`webhook enqueue failed for ${eventType}`, e as Error);
    }
    try {
      const integrations = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
        tx.orgIntegration.findMany({ where: { organizationId, status: 'active' }, select: { id: true, events: true } }),
      );
      const matched = integrations.filter((i) => parseEvents(i.events).includes(eventType));
      for (const integration of matched) {
        const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
          tx.integrationDelivery.create({ data: { organizationId, integrationId: integration.id, eventType, status: 'pending' } }),
        );
        await this.queue.add('deliver', { deliveryId: delivery.id, eventType, payload }, JOB_OPTS);
      }
    } catch (e) {
      this.logger.error(`chat fan-out failed for ${eventType}`, e as Error);
    }
  }

  async enqueueTest(organizationId: string, integrationId: string): Promise<void> {
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.integrationDelivery.create({ data: { organizationId, integrationId, eventType: 'attempt.submitted', status: 'pending' } }),
    );
    await this.queue.add(
      'deliver',
      {
        deliveryId: delivery.id,
        eventType: 'attempt.submitted',
        payload: { subject: 'Test message', examTitle: 'Connection test', linkPath: '/settings/integrations' },
      },
      JOB_OPTS,
    );
  }
}

function parseEvents(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}
