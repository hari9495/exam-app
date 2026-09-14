import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '@exam-platform/shared';
import { HRIS_EXPORTS_QUEUE } from './hris-exports.queue';
import { buildHrisEmployeePayload } from './hris-payload';

// Same retry profile as the chat/webhook fan-out (integration-events.service.ts).
const JOB_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } as const };

@Injectable()
export class HrisExportService {
  private readonly logger = new Logger(HrisExportService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(HRIS_EXPORTS_QUEUE) private readonly queue: Queue,
  ) {}

  // Called POST-COMMIT from the hire choke point (pipeline.service). Never throws to the caller --
  // a failed export must never roll back or block the hire. INERT unless the org has enabled HRIS
  // export AND set a target URL; then it snapshots a structured employee record and enqueues a
  // durable, retried delivery (worker does the SSRF-guarded POST).
  async exportOnHire(organizationId: string, candidateId: string, jobId: string): Promise<void> {
    const context = { organizationId, isSuperAdmin: false };
    const org = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId }, select: { hrisExportEnabled: true, hrisTargetUrl: true } }),
    );
    if (!org?.hrisExportEnabled || !org.hrisTargetUrl) return; // inert — not configured/enabled

    const [candidate, job, offer] = await this.tenantPrisma.forTenant(context, (tx) =>
      Promise.all([
        tx.candidate.findUnique({ where: { id: candidateId }, select: { id: true, name: true, email: true, phone: true } }),
        tx.job.findUnique({ where: { id: jobId }, select: { id: true, title: true, department: true } }),
        // Best available comp/start-date: the candidate's most recently accepted offer, if any.
        tx.offer.findFirst({
          where: { candidateId, status: 'accepted' },
          orderBy: { respondedAt: 'desc' },
          select: { compensation: true, startDate: true },
        }),
      ]),
    );
    if (!candidate || !job) return; // data vanished between hire and this read — nothing to export

    const payload = buildHrisEmployeePayload({
      organizationId,
      hiredAt: new Date(),
      candidate,
      job,
      offer: offer ? { compensation: offer.compensation, startDate: offer.startDate.toISOString() } : null,
    });

    const delivery = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.hrisExportDelivery.create({ data: { organizationId, candidateId, payloadJson: JSON.stringify(payload), status: 'pending' } }),
    );
    await this.queue.add('export', { deliveryId: delivery.id }, JOB_OPTS);
  }
}
