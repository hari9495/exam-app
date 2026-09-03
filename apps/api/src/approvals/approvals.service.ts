import { Injectable, Logger } from '@nestjs/common';
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
