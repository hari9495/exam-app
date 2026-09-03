import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  TenantContext,
  TenantPrismaService,
  AuditService,
  ApprovalGate,
  ApproverType,
  ResolvedStep,
  APPROVAL_NOTIFICATION_TYPES,
} from '@exam-platform/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveSteps } from './approver-resolver';

export interface SubmitResult {
  status: 'approved' | 'pending_approval';
  requestId?: string;
}

export interface DecideResult {
  requestStatus: string;
  subjectResolved: boolean;
  subjectType: string;
  subjectId: string;
  gate: ApprovalGate;
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
