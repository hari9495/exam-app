import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import { ApprovalsEngine, type StepSpec } from '../workflow/approvals-engine.service';
import { companyContext } from '../org-structure/org-structure.service';
import { REQUISITION_TYPE } from './requisitions.service';
import { OFFER_TYPE } from '../offers/offer-builder.service';

type Tx = Prisma.TransactionClient;
const PLATFORM = { organizationId: null, isSuperAdmin: true };

/**
 * Retire /v2, answers 2433 and 2511 (founder, 18 Nov 2026): a requisition or offer still waiting in the older approvals
 * engine (approval_requests) moves into the P03 engine at the step it had reached, with that step's and the later steps'
 * approvers. The older row becomes 'migrated' (kept as history; its decisions stay); the job or offer keeps waiting and
 * now points at the P03 request, so the P03 handlers open the job or approve the offer.
 *
 * Safe to run again: each row is claimed (pending_approval → migrated) in the same transaction that makes its P03
 * request, so a second run, or two API instances at once, never move a request twice. Runs at start-up; a no-op once
 * nothing old is waiting.
 */
@Injectable()
export class OldApprovalsMigration implements OnApplicationBootstrap {
  private readonly logger = new Logger(OldApprovalsMigration.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly engine: ApprovalsEngine,
  ) {}

  async onApplicationBootstrap() {
    try {
      const moved = await this.run();
      if (moved) this.logger.log(`Moved ${moved} older approval request(s) into the approvals engine.`);
    } catch (e) {
      this.logger.error('Moving older approval requests failed; they stay in the older engine until the next start.', e as Error);
    }
  }

  /** Moves every waiting older request; returns how many moved. */
  async run(): Promise<number> {
    const waiting = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.approvalRequest.findMany({ where: { status: 'pending_approval' }, select: { id: true, organizationId: true }, orderBy: { submittedAt: 'asc' } }));
    let moved = 0;
    for (const w of waiting) {
      const c = companyContext({ organizationId: w.organizationId, isSuperAdmin: false });
      try {
        if (await this.tenantPrisma.forTenant(c, (tx) => this.moveOne(tx, c, w.id))) moved++;
      } catch (e) {
        // This one stays in the older engine (its claim rolled back); the others still move.
        this.logger.error(`Older approval request ${w.id} could not move: ${(e as Error).message}`);
      }
    }
    return moved;
  }

  private async moveOne(tx: Tx, c: ReturnType<typeof companyContext>, id: string): Promise<boolean> {
    const org = c.organizationId;
    // Claim it first: only one run moves it.
    const claimed = await tx.approvalRequest.updateMany({ where: { id, organizationId: org, status: 'pending_approval' }, data: { status: 'migrated' } });
    if (claimed.count !== 1) return false;
    const old = await tx.approvalRequest.findFirstOrThrow({ where: { id } });
    const snapshot = JSON.parse(old.chainSnapshotJson) as { position: number; name: string; approverUserIds: string[] }[];
    const sender = old.submittedByUserId;
    const steps: StepSpec[] = snapshot
      .filter((s) => s.position >= old.currentStepPosition)
      .map((s) => ({ name: s.name, approvers: [{ kind: 'users', userIds: s.approverUserIds.filter((u) => u !== sender) }], mode: 'any', selfApproval: 'never' }));
    const admins = (await tx.user.findMany({ where: { organizationId: org, role: 'org_admin', status: 'active', id: { not: sender } }, select: { id: true }, take: 25 })).map((u) => u.id);
    const isJob = old.subjectType === 'job';
    const subject = isJob
      ? await tx.job.findFirst({ where: { organizationId: org, id: old.subjectId }, select: { id: true, title: true, status: true } })
      : await tx.offer.findFirst({ where: { organizationId: org, id: old.subjectId }, select: { id: true, status: true, pipelineEntry: { select: { candidate: { select: { name: true } }, job: { select: { title: true } } } } } });
    // The job or offer is gone or no longer waiting: nothing to move (the older row stays 'migrated' as history).
    if (!subject || subject.status !== 'pending_approval' || !steps.length) {
      await AuditService.recordIn(tx, c, { actorUserId: null, action: 'workflow.request.migrated', entityType: old.subjectType, entityId: old.subjectId, metadata: { from: id, to: null, why: !subject ? 'gone' : !steps.length ? 'no steps left' : 'not waiting' } });
      return true;
    }
    const title = isJob ? `Requisition: ${(subject as { title: string }).title}` : (() => {
      const o = subject as { pipelineEntry: { candidate: { name: string }; job: { title: string } } };
      return `Offer: ${o.pipelineEntry.candidate.name}, ${o.pipelineEntry.job.title}`;
    })();
    const sub = await this.engine.submit(tx, c, {
      type: isJob ? REQUISITION_TYPE : OFFER_TYPE,
      subjectType: old.subjectType,
      subjectId: old.subjectId,
      title,
      summary: [{ label: 'Moved from', value: `the older approvals, step ${old.currentStepPosition} of ${snapshot.length}` }],
      subjectPersonId: null,
      requesterUserId: sender,
      raisedByUserId: sender,
      steps,
      payload: {},
      payloadFields: [],
      fallbackUserIds: admins,
      fallbackWording: { who: 'the company admins', check: 'Check who approves requisitions and offers' },
    });
    if (isJob) await tx.job.update({ where: { id: old.subjectId }, data: { wfRequestId: sub.id } });
    else await tx.offer.update({ where: { id: old.subjectId }, data: { wfRequestId: sub.id } });
    await AuditService.recordIn(tx, c, { actorUserId: null, action: 'workflow.request.migrated', entityType: old.subjectType, entityId: old.subjectId, metadata: { from: id, to: sub.id, step: old.currentStepPosition } });
    return true;
  }
}
