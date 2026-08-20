import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createHmac } from 'crypto';
import { TenantPrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from './redis-connection';
import { WEBHOOK_DELIVERIES_QUEUE_NAME } from './webhook-deliveries.queue';
import { assertPublicWebhookTarget } from '../integrations/webhook-url-allowlist';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

interface WebhookDeliveryJobData {
  deliveryId: string;
}

@Injectable()
export class WebhookDeliveryWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorkerService.name);
  private readonly worker: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {
    this.worker = new Worker(WEBHOOK_DELIVERIES_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
    // BullMQ fires 'failed' after every failed attempt, including ones that will
    // still retry -- only mark the row permanently failed once attemptsMade has
    // reached the job's configured attempts ceiling (job.opts.attempts).
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.markFailed((job.data as WebhookDeliveryJobData).deliveryId).catch((error) =>
          this.logger.error('Failed to mark webhook delivery as permanently failed', error as Error),
        );
      }
    });
  }

  private async handle(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { deliveryId } = job.data;
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { organization: true } }),
    );
    const { webhookUrl, webhookSecretEncrypted } = delivery.organization;
    if (!webhookUrl || !webhookSecretEncrypted) {
      throw new Error(`Organization ${delivery.organizationId} has no webhook configured`);
    }

    // SSRF: refuse targets resolving to internal/private/metadata addresses; redirect:'error' below
    // stops a public endpoint bouncing us inward. (This org webhook URL is user-supplied and unallowlisted.)
    await assertPublicWebhookTarget(webhookUrl);

    const secret = this.cryptoService.decrypt(webhookSecretEncrypted);
    const signature = createHmac('sha256', secret).update(delivery.payloadJson).digest('hex');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
      body: delivery.payloadJson,
    });

    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: response.ok ? 'delivered' : 'pending', httpStatusCode: response.status, attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
      }),
    );
    if (!response.ok) {
      throw new Error(`Webhook endpoint responded with status ${response.status}`);
    }
  }

  private async markFailed(deliveryId: string): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'failed' } }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
