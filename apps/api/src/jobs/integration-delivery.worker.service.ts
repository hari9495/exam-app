import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService, OrgSecretsCryptoService, IntegrationEventType } from '@exam-platform/shared';
import { REDIS_CONNECTION } from './redis-connection';
import { INTEGRATION_DELIVERIES_QUEUE_NAME } from './integration-deliveries.queue';
import { assertAllowedWebhookUrl, assertPublicWebhookTarget, IntegrationType } from '../integrations/webhook-url-allowlist';
import { buildEventSummary } from '../integrations/formatting/event-summary';
import { formatSlackMessage } from '../integrations/formatting/format-slack';
import { formatTeamsMessage } from '../integrations/formatting/format-teams';
import { formatWebhookMessage } from '../integrations/formatting/format-webhook';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

export interface IntegrationDeliveryJobData {
  deliveryId: string;
  eventType: IntegrationEventType;
  payload: Record<string, unknown>;
}

interface DeliveryRow { id: string; organizationId: string; integrationId: string; eventType: string }
interface IntegrationRow { id: string; organizationId: string; type: string; targetUrlEncrypted: string; status: string }

@Injectable()
export class IntegrationDeliveryWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(IntegrationDeliveryWorkerService.name);
  private readonly worker: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {
    this.worker = new Worker(INTEGRATION_DELIVERIES_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
    // BullMQ fires 'failed' after every failed attempt, including ones that will still retry --
    // only mark the row permanently failed once attemptsMade has reached the job's configured
    // attempts ceiling (job.opts.attempts), mirroring webhook-delivery.worker.service.ts.
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        const data = job.data as IntegrationDeliveryJobData;
        void this.markFailed(data.deliveryId).catch((e) => this.logger.error('mark failed', e as Error));
      }
    });
  }

  private async handle(job: Job<IntegrationDeliveryJobData>): Promise<void> {
    const { deliveryId, eventType, payload } = job.data;
    const { delivery, integration } = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, async (tx) => {
      const d = await tx.integrationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
      const i = await tx.orgIntegration.findUnique({ where: { id: d.integrationId } });
      return { delivery: d, integration: i };
    });
    if (!integration || integration.status !== 'active') {
      // Config removed/disabled between enqueue and run: mark failed, do not retry.
      await this.markFailed(deliveryId, 'integration missing or disabled');
      return;
    }
    await this.deliver(delivery as DeliveryRow, integration as IntegrationRow, eventType, payload);
  }

  // Extracted for unit tests (no Redis needed).
  async deliver(delivery: DeliveryRow, integration: IntegrationRow, eventType: IntegrationEventType, payload: Record<string, unknown>): Promise<void> {
    const type = integration.type as IntegrationType;
    const url = this.cryptoService.decrypt(integration.targetUrlEncrypted);
    assertAllowedWebhookUrl(type, url); // throws -> caught by caller -> marked failed, no retry value
    if (type === 'webhook') await assertPublicWebhookTarget(url); // SSRF: block internal/metadata targets after DNS resolve

    const baseUrl = process.env.APP_BASE_URL ?? '';
    const summary = buildEventSummary(eventType, payload, baseUrl);
    const body =
      type === 'slack' ? formatSlackMessage(summary) : type === 'msteams' ? formatTeamsMessage(summary) : formatWebhookMessage(eventType, summary);

    let response: { ok: boolean; status: number };
    try {
      // redirect:'error' so a redirecting endpoint can't bounce us past the host allowlist —
      // *.logic.azure.com (Teams) is tenant-controllable and could 307/308 to an internal host (SSRF).
      response = await fetch(url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      await this.recordAttempt(delivery, integration, false, undefined, (e as Error).message);
      throw e;
    }
    await this.recordAttempt(delivery, integration, response.ok, response.status, response.ok ? undefined : `status ${response.status}`);
    if (!response.ok) {
      throw new Error(`Chat endpoint responded with status ${response.status}`);
    }
  }

  private async recordAttempt(delivery: DeliveryRow, integration: IntegrationRow, ok: boolean, httpStatusCode: number | undefined, error: string | undefined): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, async (tx) => {
      await tx.integrationDelivery.update({
        where: { id: delivery.id },
        data: { status: ok ? 'delivered' : 'pending', httpStatusCode, attemptCount: { increment: 1 }, lastAttemptAt: new Date(), errorDetail: error ?? null },
      });
      await tx.orgIntegration.update({
        where: { id: integration.id },
        data: ok ? { lastDeliveryAt: new Date(), lastError: null } : { lastError: error ?? 'delivery failed' },
      });
    });
  }

  private async markFailed(deliveryId: string, error?: string): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.integrationDelivery.update({ where: { id: deliveryId }, data: { status: 'failed', errorDetail: error ?? null } }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
