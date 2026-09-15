import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from '../jobs/redis-connection';
import { HRIS_EXPORTS_QUEUE_NAME } from './hris-exports.queue';
import { assertAllowedWebhookUrl, assertPublicWebhookTarget } from '../integrations/webhook-url-allowlist';
import { getHrisConnector } from './providers';
import type { HrisEmployeePayload } from './hris-payload';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

export interface HrisExportJobData {
  deliveryId: string;
}

interface DeliveryRow { id: string; organizationId: string; payloadJson: string }
interface OrgHrisConfig { hrisExportEnabled: boolean; hrisProvider: string; hrisTargetUrl: string | null; hrisAuthHeaderEncrypted: string | null }

@Injectable()
export class HrisExportWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(HrisExportWorkerService.name);
  private readonly worker: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {
    this.worker = new Worker(HRIS_EXPORTS_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
    // Mark permanently failed only once the retry ceiling is reached (mirrors the other delivery
    // workers) — BullMQ fires 'failed' after every attempt, retryable ones included.
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        const data = job.data as HrisExportJobData;
        void this.markFailed(data.deliveryId).catch((e) => this.logger.error('mark failed', e as Error));
      }
    });
  }

  private async handle(job: Job<HrisExportJobData>): Promise<void> {
    const { deliveryId } = job.data;
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.hrisExportDelivery.findUniqueOrThrow({ where: { id: deliveryId } }),
    );
    const org = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.organization.findUnique({
        where: { id: delivery.organizationId },
        select: { hrisExportEnabled: true, hrisProvider: true, hrisTargetUrl: true, hrisAuthHeaderEncrypted: true },
      }),
    );
    if (!org?.hrisExportEnabled) {
      // Disabled between enqueue and run: mark failed, do not retry. (A vendor connector may have no
      // targetUrl — the connector's buildRequest validates the rest of the config below.)
      await this.markFailed(deliveryId, 'HRIS export disabled or unconfigured');
      return;
    }
    await this.deliver(delivery as DeliveryRow, org as OrgHrisConfig);
  }

  // Extracted for unit tests (no Redis needed).
  async deliver(delivery: DeliveryRow, org: OrgHrisConfig): Promise<void> {
    // Resolve the vendor connector and let it map the hire payload to the right endpoint/auth/body.
    // Generic posts the payload verbatim (unchanged behaviour); vendors re-shape it for their API.
    const connector = getHrisConnector(org.hrisProvider);
    const secret = org.hrisAuthHeaderEncrypted ? this.cryptoService.decrypt(org.hrisAuthHeaderEncrypted) : null;
    const payload = JSON.parse(delivery.payloadJson) as HrisEmployeePayload;

    let request: { url: string; method: 'POST'; headers: Record<string, string>; body: string };
    try {
      request = connector.buildRequest(payload, { targetUrl: org.hrisTargetUrl, secret });
    } catch (e) {
      // A config error won't fix on retry, but marking the attempt failed (and rethrowing) lets the
      // normal retry-ceiling path terminate it — same as a persistent HTTP failure.
      await this.recordAttempt(delivery, false, undefined, (e as Error).message);
      throw e;
    }

    // https + public-host allowlist, then a DNS-resolve SSRF guard so the target can't point at
    // internal/metadata addresses. redirect:'error' stops a redirect from bouncing past the guard.
    assertAllowedWebhookUrl('webhook', request.url);
    await assertPublicWebhookTarget(request.url);

    let response: { ok: boolean; status: number };
    try {
      response = await fetch(request.url, { method: request.method, redirect: 'error', headers: request.headers, body: request.body });
    } catch (e) {
      await this.recordAttempt(delivery, false, undefined, (e as Error).message);
      throw e;
    }
    await this.recordAttempt(delivery, response.ok, response.status, response.ok ? undefined : `status ${response.status}`);
    if (!response.ok) {
      throw new Error(`HRIS endpoint responded with status ${response.status}`);
    }
  }

  private async recordAttempt(delivery: DeliveryRow, ok: boolean, httpStatusCode: number | undefined, error: string | undefined): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.hrisExportDelivery.update({
        where: { id: delivery.id },
        data: {
          status: ok ? 'delivered' : 'pending',
          httpStatusCode,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          errorDetail: error ?? null,
        },
      }),
    );
  }

  private async markFailed(deliveryId: string, error?: string): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.hrisExportDelivery.update({ where: { id: deliveryId }, data: { status: 'failed', errorDetail: error ?? null } }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
