import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '@exam-platform/shared';
import { WEBHOOK_DELIVERIES_QUEUE } from '../jobs/webhook-deliveries.queue';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

@Injectable()
export class WebhooksService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(WEBHOOK_DELIVERIES_QUEUE) private readonly queue: Queue,
  ) {}

  // Callers (invitation creation, and the internal endpoint the attempt.settled path
  // hits from exam-runtime) pass a raw organizationId rather than a TenantContext --
  // by the time either call site reaches here, organizationId is already known, and
  // requiring a full TenantContext would just push this same bootstrap lookup onto
  // both callers instead of doing it once, here.
  async enqueue(organizationId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    const organization = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId }, select: { webhookUrl: true } }),
    );
    if (!organization?.webhookUrl) {
      return;
    }
    const payloadJson = JSON.stringify(data);
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.create({ data: { organizationId, eventType, payloadJson, status: 'pending' } }),
    );
    await this.queue.add('deliver', { deliveryId: delivery.id }, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } });
  }
}
