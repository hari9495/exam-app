import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  TenantContext,
  TenantPrismaService,
  AuditService,
  ApprovalGate,
  ApproverType,
  ResolvedStep,
  APPROVAL_GATES,
  APPROVAL_NOTIFICATION_TYPES,
} from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveSteps } from './approver-resolver';
import { UpsertChainDto } from './dto/upsert-chain.dto';

export interface ChainStepDto {
  position: number;
  name: string;
  approverType: string;
  approverUserIds: string[];
  managerLevel: number | null;
}

export interface ChainDto {
  gate: ApprovalGate;
  enabled: boolean;
  steps: ChainStepDto[];
}

export interface SubmitResult {
  status: 'approved' | 'pending_approval';
  requestId?: string;
}

export interface DecideResult {
  requestStatus: string;
  // Retained for the HTTP response shape only -- the subject flip (job/offer status) already
  // happens in-layer inside decide() itself, so no caller consumes this field to trigger dispatch.
  subjectResolved: boolean;
  subjectType: string;
  subjectId: string;
  gate: ApprovalGate;
}

export interface RequestSummary {
  id: string;
  gate: ApprovalGate;
  subjectType: string;
  subjectId: string;
  status: string;
  currentStepPosition: number;
  submittedByUserId: string;
  submittedAt: Date;
  stepCount: number;
}

export interface ApprovalSummary {
  status: string;
  currentStep: number;
  steps: { name: string; state: 'pending' | 'approved' | 'rejected' }[];
}

export interface RequestDetail {
  id: string;
  gate: ApprovalGate;
  subjectType: string;
  subjectId: string;
  status: string;
  currentStepPosition: number;
  submittedByUserId: string;
  submittedAt: Date;
  steps: ResolvedStep[];
  decisions: { id: string; stepPosition: number; approverUserId: string; decision: string; note: string | null; decidedAt: Date }[];
  subject: Record<string, unknown>;
}

// decide()'s tx callback stays pure DB work; audit + notify run after commit for the same
// reason as submit()'s post-commit notify block -- a notification/audit failure must not
// roll back a decision that's already been persisted.
interface DecideTxOutcome {
  result: DecideResult;
  requestId: string;
  submittedByUserId: string;
  nextStepApproverIds?: string[];
}

// Everything the tx callback needs to hand back to the post-commit notification step.
// Notifications (and the admin lookup they need) never run inside the forTenant callback
// itself -- same convention as PipelineService.assignEntry / OffersService.recordResponse:
// a notification failure must not roll back an approval request that's already committed.
interface SubmitTxOutcome {
  result: SubmitResult;
  subjectType: 'job' | 'offer';
  resolvedFirstStep?: ResolvedStep;
  skipped: { position: number; reason: string }[];
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  // Nil-GUID sentinel for a system-generated notification's actor -- same convention as the
  // LOOKUP_ORG sentinel in offers/interviews/public-applications services. Needed because
  // NotificationsService.notify() unconditionally drops the actor from its own recipient list
  // (`ids.filter(id => id !== actorUserId)`), and this notification's real recipient list is
  // [submitter, ...admins]: using submitterUserId as the actor here would silently drop the
  // submitter from their own "your submission had skipped steps" notification.
  private readonly SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(context: TenantContext, gate: ApprovalGate, subjectId: string, submitterUserId: string): Promise<SubmitResult> {
    const subjectType: 'job' | 'offer' = gate === 'requisition' ? 'job' : 'offer';

    const outcome = await this.tenantPrisma.forTenant(context, async (tx): Promise<SubmitTxOutcome> => {
      const chain = await tx.approvalChain.findUnique({
        where: { organizationId_gate: { organizationId: context.organizationId as string, gate } },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
      if (!chain || !chain.enabled) {
        return { result: { status: 'approved' }, subjectType, skipped: [] };
      }

      const stepInputs = chain.steps.map((s) => ({
        position: s.position,
        name: s.name,
        approverType: s.approverType as ApproverType,
        approverUserIds: s.approverUserIds ? JSON.parse(s.approverUserIds) : [],
        managerLevel: s.managerLevel,
      }));
      const { resolved, skipped } = await resolveSteps(tx, { steps: stepInputs, submitterUserId, gate, subjectId });

      for (const sk of skipped) {
        await this.audit.record(context, {
          actorUserId: submitterUserId,
          action: 'approval.step_skipped',
          entityType: subjectType,
          entityId: subjectId,
          metadata: { position: sk.position, reason: sk.reason },
        });
      }

      if (resolved.length === 0) {
        await this.audit.record(context, {
          actorUserId: submitterUserId,
          action: 'approval.auto_passed',
          entityType: subjectType,
          entityId: subjectId,
        });
        return { result: { status: 'approved' }, subjectType, skipped };
      }

      const request = await tx.approvalRequest.create({
        data: {
          organizationId: context.organizationId as string,
          gate,
          subjectType,
          subjectId,
          status: 'pending_approval',
          currentStepPosition: 0,
          submittedByUserId: submitterUserId,
          chainSnapshotJson: JSON.stringify(resolved),
        },
      });
      await this.audit.record(context, {
        actorUserId: submitterUserId,
        action: 'approval.submitted',
        entityType: subjectType,
        entityId: subjectId,
      });

      return {
        result: { status: 'pending_approval', requestId: request.id },
        subjectType,
        resolvedFirstStep: resolved[0],
        skipped,
      };
    });

    if (outcome.result.status === 'pending_approval' && outcome.resolvedFirstStep) {
      try {
        await this.notifications.notify(
          context,
          submitterUserId,
          outcome.resolvedFirstStep.approverUserIds,
          APPROVAL_NOTIFICATION_TYPES.requested,
          { entityType: outcome.subjectType, entityId: subjectId, linkPath: `/v2/approvals/${outcome.result.requestId}` },
        );
      } catch (e) {
        this.logger.error(`approval request notification failed for ${subjectType} ${subjectId}`, e as Error);
      }
    }

    if (outcome.skipped.length > 0) {
      try {
        const adminIds = await this.getApprovalsConfigureHolderIds(context);
        const recipients = [submitterUserId, ...adminIds];
        await this.notifications.notify(context, this.SYSTEM_ACTOR_ID, recipients, 'approval.step_skipped', {
          entityType: outcome.subjectType,
          entityId: subjectId,
          contextText: outcome.skipped.map((s) => s.reason).join('; '),
          linkPath: `/v2/approvals`,
        });
      } catch (e) {
        this.logger.error(`skipped-step notification failed for ${subjectType} ${subjectId}`, e as Error);
      }
    }

    return outcome.result;
  }

  async decide(
    context: TenantContext,
    requestId: string,
    actorUserId: string,
    decision: 'approved' | 'rejected',
    note?: string,
  ): Promise<DecideResult> {
    const outcome = await this.tenantPrisma.forTenant(context, async (tx): Promise<DecideTxOutcome> => {
      const req = await tx.approvalRequest.findFirst({
        where: { id: requestId, organizationId: context.organizationId as string },
      });
      if (!req || req.status !== 'pending_approval') {
        throw new ConflictException('Request is not open for approval');
      }
      const steps: ResolvedStep[] = JSON.parse(req.chainSnapshotJson);
      const step = steps[req.currentStepPosition];
      if (!step || !step.approverUserIds.includes(actorUserId)) {
        throw new ForbiddenException('Not an approver for the current step');
      }

      await tx.approvalDecision.create({
        data: { requestId, stepPosition: req.currentStepPosition, approverUserId: actorUserId, decision, note: note ?? null },
      });

      const isLast = req.currentStepPosition >= steps.length - 1;

      if (decision === 'rejected') {
        const upd = await tx.approvalRequest.updateMany({
          where: { id: requestId, status: 'pending_approval', currentStepPosition: req.currentStepPosition },
          data: { status: 'rejected', decidedAt: new Date() },
        });
        if (upd.count === 0) throw new ConflictException('Already actioned');
        if (req.subjectType === 'job') {
          await tx.job.updateMany({ where: { id: req.subjectId, organizationId: context.organizationId as string }, data: { status: 'draft' } });
        } else {
          await tx.offer.updateMany({ where: { id: req.subjectId, organizationId: context.organizationId as string }, data: { status: 'draft' } });
        }
        return {
          result: { requestStatus: 'rejected', subjectResolved: true, subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate },
          requestId,
          submittedByUserId: req.submittedByUserId,
        };
      }

      if (isLast) {
        const upd = await tx.approvalRequest.updateMany({
          where: { id: requestId, status: 'pending_approval', currentStepPosition: req.currentStepPosition },
          data: { status: 'approved', decidedAt: new Date() },
        });
        if (upd.count === 0) throw new ConflictException('Already actioned');
        if (req.subjectType === 'job') {
          await tx.job.updateMany({ where: { id: req.subjectId, organizationId: context.organizationId as string }, data: { status: 'open' } });
        } else {
          await tx.offer.updateMany({ where: { id: req.subjectId, organizationId: context.organizationId as string }, data: { status: 'approved' } });
        }
        return {
          result: { requestStatus: 'approved', subjectResolved: true, subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate },
          requestId,
          submittedByUserId: req.submittedByUserId,
        };
      }

      const upd = await tx.approvalRequest.updateMany({
        where: { id: requestId, status: 'pending_approval', currentStepPosition: req.currentStepPosition },
        data: { currentStepPosition: req.currentStepPosition + 1 },
      });
      if (upd.count === 0) throw new ConflictException('Already actioned');
      return {
        result: { requestStatus: 'pending_approval', subjectResolved: false, subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate },
        requestId,
        submittedByUserId: req.submittedByUserId,
        nextStepApproverIds: steps[req.currentStepPosition + 1].approverUserIds,
      };
    });

    try {
      await this.audit.record(context, {
        actorUserId,
        action: `approval.${decision}`,
        entityType: outcome.result.subjectType,
        entityId: outcome.result.subjectId,
      });
    } catch (e) {
      this.logger.error(`approval decision audit failed for request ${requestId}`, e as Error);
    }

    try {
      const target = { entityType: outcome.result.subjectType, entityId: outcome.result.subjectId, linkPath: `/v2/approvals/${outcome.requestId}` };
      if (outcome.result.requestStatus === 'pending_approval' && outcome.nextStepApproverIds) {
        await this.notifications.notify(context, actorUserId, outcome.nextStepApproverIds, APPROVAL_NOTIFICATION_TYPES.requested, target);
      } else if (outcome.result.requestStatus === 'approved') {
        await this.notifications.notify(context, actorUserId, [outcome.submittedByUserId], APPROVAL_NOTIFICATION_TYPES.approved, target);
      } else if (outcome.result.requestStatus === 'rejected') {
        await this.notifications.notify(context, actorUserId, [outcome.submittedByUserId], APPROVAL_NOTIFICATION_TYPES.rejected, target);
      }
    } catch (e) {
      this.logger.error(`approval decision notification failed for request ${requestId}`, e as Error);
    }

    return outcome.result;
  }

  async listRequests(
    context: TenantContext,
    userId: string,
    scope: 'inbox' | 'submitted',
    status?: string,
  ): Promise<RequestSummary[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      if (scope === 'submitted') {
        const rows = await tx.approvalRequest.findMany({
          where: { organizationId: context.organizationId as string, submittedByUserId: userId, ...(status ? { status } : {}) },
        });
        return rows.map(this.toRequestSummary);
      }

      // ponytail: in-app inbox filter over pending requests; denormalize current_approver_user_id if volume grows
      const rows = await tx.approvalRequest.findMany({
        where: { organizationId: context.organizationId as string, status: 'pending_approval' },
      });
      return rows
        .filter((r) => {
          const steps: ResolvedStep[] = JSON.parse(r.chainSnapshotJson);
          const step = steps[r.currentStepPosition];
          return !!step && step.approverUserIds.includes(userId);
        })
        .map(this.toRequestSummary);
    });
  }

  private toRequestSummary(r: {
    id: string;
    gate: string;
    subjectType: string;
    subjectId: string;
    status: string;
    currentStepPosition: number;
    submittedByUserId: string;
    submittedAt: Date;
    chainSnapshotJson: string;
  }): RequestSummary {
    const steps: ResolvedStep[] = JSON.parse(r.chainSnapshotJson);
    return {
      id: r.id,
      gate: r.gate as ApprovalGate,
      subjectType: r.subjectType,
      subjectId: r.subjectId,
      status: r.status,
      currentStepPosition: r.currentStepPosition,
      submittedByUserId: r.submittedByUserId,
      submittedAt: r.submittedAt,
      stepCount: steps.length,
    };
  }

  async getRequestDetail(context: TenantContext, requestId: string): Promise<RequestDetail> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const req = await tx.approvalRequest.findFirst({
        where: { id: requestId, organizationId: context.organizationId as string },
        include: { decisions: { orderBy: { decidedAt: 'asc' } } },
      });
      if (!req) throw new NotFoundException('Approval request not found');

      const steps: ResolvedStep[] = JSON.parse(req.chainSnapshotJson);

      let subject: Record<string, unknown>;
      if (req.subjectType === 'job') {
        const job = await tx.job.findFirst({
          where: { id: req.subjectId, organizationId: context.organizationId as string },
          select: { title: true, status: true },
        });
        subject = { title: job?.title, status: job?.status };
      } else {
        const offer = await tx.offer.findFirst({
          where: { id: req.subjectId, organizationId: context.organizationId as string },
          select: { compensation: true, status: true, candidateId: true },
        });
        let candidateName: string | undefined;
        if (offer?.candidateId) {
          const candidate = await tx.candidate.findFirst({ where: { id: offer.candidateId }, select: { name: true } });
          candidateName = candidate?.name;
        }
        subject = { candidateName, compensation: offer?.compensation, status: offer?.status };
      }

      return {
        id: req.id,
        gate: req.gate as ApprovalGate,
        subjectType: req.subjectType,
        subjectId: req.subjectId,
        status: req.status,
        currentStepPosition: req.currentStepPosition,
        submittedByUserId: req.submittedByUserId,
        submittedAt: req.submittedAt,
        steps,
        decisions: req.decisions,
        subject,
      };
    });
  }

  // Unlike decide(), which flips the subject (job/offer) status in-layer as part of the same
  // transaction, cancel() does not touch the subject at all -- it relies on its caller
  // (PipelineService.cancelRequisitionApproval / OffersService.cancelOfferApproval) to flip it
  // back to 'draft' after this returns.
  async cancel(
    context: TenantContext,
    requestId: string,
    actorUserId: string,
    isConfigurer: boolean,
  ): Promise<{ subjectType: string; subjectId: string; gate: ApprovalGate }> {
    const outcome = await this.tenantPrisma.forTenant(context, async (tx) => {
      const req = await tx.approvalRequest.findFirst({
        where: { id: requestId, organizationId: context.organizationId as string },
      });
      if (!req || req.status !== 'pending_approval') {
        throw new ConflictException('Request is not open for approval');
      }
      if (req.submittedByUserId !== actorUserId && !isConfigurer) {
        throw new ForbiddenException('Not allowed to cancel this request');
      }

      const upd = await tx.approvalRequest.updateMany({
        where: { id: requestId, status: 'pending_approval' },
        data: { status: 'cancelled', decidedAt: new Date() },
      });
      if (upd.count === 0) throw new ConflictException('Already actioned');

      const steps: ResolvedStep[] = JSON.parse(req.chainSnapshotJson);
      const currentStepApproverIds = steps[req.currentStepPosition]?.approverUserIds ?? [];

      return {
        result: { subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate },
        currentStepApproverIds,
      };
    });

    try {
      await this.audit.record(context, {
        actorUserId,
        action: 'approval.cancelled',
        entityType: outcome.result.subjectType,
        entityId: outcome.result.subjectId,
      });
    } catch (e) {
      this.logger.error(`approval cancellation audit failed for request ${requestId}`, e as Error);
    }

    try {
      await this.notifications.notify(
        context,
        actorUserId,
        outcome.currentStepApproverIds,
        APPROVAL_NOTIFICATION_TYPES.cancelled,
        { entityType: outcome.result.subjectType, entityId: outcome.result.subjectId, linkPath: `/v2/approvals/${requestId}` },
      );
    } catch (e) {
      this.logger.error(`approval cancellation notification failed for request ${requestId}`, e as Error);
    }

    return outcome.result;
  }

  async getChains(context: TenantContext): Promise<{ requisition: ChainDto; offer: ChainDto }> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.approvalChain.findMany({
        where: { organizationId: context.organizationId as string, gate: { in: [...APPROVAL_GATES] } },
        include: { steps: { orderBy: { position: 'asc' } } },
      }),
    );

    const byGate = new Map(rows.map((r) => [r.gate as ApprovalGate, r]));
    const toDto = (gate: ApprovalGate): ChainDto => {
      const row = byGate.get(gate);
      if (!row) return { gate, enabled: false, steps: [] };
      return {
        gate,
        enabled: row.enabled,
        steps: row.steps.map((s: { position: number; name: string; approverType: string; approverUserIds: string | null; managerLevel: number | null }) => ({
          position: s.position,
          name: s.name,
          approverType: s.approverType,
          approverUserIds: s.approverUserIds ? JSON.parse(s.approverUserIds) : [],
          managerLevel: s.managerLevel,
        })),
      };
    };

    return { requisition: toDto('requisition'), offer: toDto('offer') };
  }

  async upsertChain(context: TenantContext, gate: ApprovalGate, dto: UpsertChainDto): Promise<ChainDto> {
    // Cross-field validation that class-validator can't express declaratively:
    // - a 'users' step needs at least one approver once the chain is enabled (a disabled
    //   chain never runs, so an incomplete draft is fine while it's off).
    // - a 'reporting_manager' step with no explicit level defaults to 1 rather than rejecting,
    //   since level 1 (direct manager) is the sane default most orgs want anyway.
    const normalizedSteps = dto.steps.map((step) => {
      if (dto.enabled && step.approverType === 'users' && (!step.approverUserIds || step.approverUserIds.length === 0)) {
        throw new BadRequestException('Each users step needs at least one approver');
      }
      const managerLevel = step.approverType === 'reporting_manager' ? (step.managerLevel ?? 1) : (step.managerLevel ?? null);
      return {
        name: step.name,
        approverType: step.approverType,
        approverUserIds: step.approverUserIds ?? [],
        managerLevel,
      };
    });

    return this.tenantPrisma.forTenant(context, async (tx): Promise<ChainDto> => {
      const chain = await tx.approvalChain.upsert({
        where: { organizationId_gate: { organizationId: context.organizationId as string, gate } },
        update: { enabled: dto.enabled },
        create: { organizationId: context.organizationId as string, gate, enabled: dto.enabled },
      });

      await tx.approvalChainStep.deleteMany({ where: { chainId: chain.id } });

      if (normalizedSteps.length > 0) {
        await tx.approvalChainStep.createMany({
          data: normalizedSteps.map((step, position) => ({
            chainId: chain.id,
            position,
            name: step.name,
            approverType: step.approverType,
            approverUserIds: JSON.stringify(step.approverUserIds),
            managerLevel: step.managerLevel,
          })),
        });
      }

      return {
        gate,
        enabled: dto.enabled,
        steps: normalizedSteps.map((step, position) => ({ ...step, position })),
      };
    });
  }

  // True when userId holds the approvals:configure permission -- used by callers (e.g. the
  // pipeline requisition-cancel endpoint) that need to decide whether an actor may cancel
  // someone else's request, without duplicating the role/permission join themselves.
  async isConfigurer(context: TenantContext, userId: string): Promise<boolean> {
    const ids = await this.getApprovalsConfigureHolderIds(context);
    return ids.includes(userId);
  }

  // Looks up the OPEN request for a subject (job/offer) and delegates to cancel() for the
  // actual permission check + state transition. Lets callers (pipeline, offers) cancel by
  // subject instead of having to know/track the approvalRequest id themselves.
  async cancelForSubject(
    context: TenantContext,
    subjectType: 'job' | 'offer',
    subjectId: string,
    actorUserId: string,
    isConfigurer: boolean,
  ): Promise<{ subjectType: string; subjectId: string; gate: ApprovalGate }> {
    const request = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.approvalRequest.findFirst({
        where: { organizationId: context.organizationId as string, subjectType, subjectId, status: 'pending_approval' },
      }),
    );
    if (!request) throw new ConflictException('No open approval request');
    return this.cancel(context, request.id, actorUserId, isConfigurer);
  }

  // Batched read for enriching job/offer read payloads with an `approval` summary (Task 13).
  // One query for all ids, keeping only the latest request per subject -- `orderBy: submittedAt
  // desc` plus "first seen wins" in the loop below does that without a second query or a
  // window function. A subject with no request is simply absent from the returned map; callers
  // map that to `approval: null`.
  async getSummariesFor(context: TenantContext, subjectType: 'job' | 'offer', ids: string[]): Promise<Map<string, ApprovalSummary>> {
    if (ids.length === 0) return new Map();

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.approvalRequest.findMany({
        where: { organizationId: context.organizationId as string, subjectType, subjectId: { in: ids } },
        orderBy: { submittedAt: 'desc' },
        include: { decisions: true },
      });

      const summaries = new Map<string, ApprovalSummary>();
      for (const row of rows) {
        if (summaries.has(row.subjectId)) continue; // already have the latest (desc order) for this subject

        const steps: ResolvedStep[] = JSON.parse(row.chainSnapshotJson);
        const decisionByPosition = new Map(row.decisions.map((d: { stepPosition: number; decision: string }) => [d.stepPosition, d.decision]));

        summaries.set(row.subjectId, {
          status: row.status,
          currentStep: row.currentStepPosition,
          steps: steps.map((step) => {
            const decision = decisionByPosition.get(step.position);
            const state: 'pending' | 'approved' | 'rejected' =
              decision === 'approved' || decision === 'rejected'
                ? decision
                : step.position < row.currentStepPosition
                  ? 'approved'
                  : 'pending';
            return { name: step.name, state };
          }),
        });
      }
      return summaries;
    });
  }

  // Single round-trip join (no relation exists between User.role and RolePermission in the
  // Prisma schema -- role is a plain string, not a FK) rather than one query per lookup.
  private async getApprovalsConfigureHolderIds(context: TenantContext): Promise<string[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT u.id AS id
        FROM users u
        INNER JOIN role_permissions rp ON rp.role = u.role
        INNER JOIN permissions p ON p.id = rp.permission_id
        WHERE p.[key] = 'approvals:configure' AND u.organization_id = ${context.organizationId} AND u.status = 'active'
      `;
      return rows.map((r) => r.id);
    });
  }
}
