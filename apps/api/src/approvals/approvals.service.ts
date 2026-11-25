import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TenantContext,
  TenantPrismaService,
  AuditService,
  ApprovalGate,
  ApproverType,
  ResolvedStep,
  APPROVAL_GATES,
  APPROVAL_NOTIFICATION_TYPES,
  isPendingForApprover,
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
  groupId: string | null;
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

export interface ApprovalSummary {
  status: string;
  currentStep: number;
  steps: { name: string; state: 'pending' | 'approved' | 'rejected' }[];
}

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // Lightweight, auth-only (no approvals:configure requirement) read of just the enabled flags --
  // lets any org user (e.g. a recruiter) know whether the offer/requisition gate is on so their
  // UI can show "Submit for approval" vs "Send", without granting them the full chain config
  // that getChains() exposes to admins only.
  async getGateStatus(context: TenantContext): Promise<{ requisition: boolean; offer: boolean }> {
    const rows = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.approvalChain.findMany({
        where: { organizationId: context.organizationId as string },
        select: { gate: true, enabled: true },
      }),
    );
    const byGate = new Map(rows.map((r) => [r.gate as ApprovalGate, r.enabled]));
    return { requisition: byGate.get('requisition') ?? false, offer: byGate.get('offer') ?? false };
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
        steps: row.steps.map(
          (s: { position: number; name: string; approverType: string; approverUserIds: string | null; managerLevel: number | null; groupId: string | null }) => ({
            position: s.position,
            name: s.name,
            approverType: s.approverType,
            approverUserIds: s.approverUserIds ? JSON.parse(s.approverUserIds) : [],
            managerLevel: s.managerLevel,
            groupId: s.groupId,
          }),
        ),
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
    // - a 'group' step always needs a groupId configured, enabled or not (there's nothing
    //   sensible to persist otherwise); the empty-active-member check only applies once
    //   enabled, mirroring the 'users' rule above.
    const normalizedSteps = dto.steps.map((step) => {
      if (dto.enabled && step.approverType === 'users' && (!step.approverUserIds || step.approverUserIds.length === 0)) {
        throw new BadRequestException('Each users step needs at least one approver');
      }
      if (step.approverType === 'group' && !step.groupId) {
        throw new BadRequestException('Each group step needs a group selected');
      }
      const managerLevel = step.approverType === 'reporting_manager' ? (step.managerLevel ?? 1) : (step.managerLevel ?? null);
      return {
        name: step.name,
        approverType: step.approverType,
        approverUserIds: step.approverUserIds ?? [],
        managerLevel,
        groupId: step.approverType === 'group' ? (step.groupId as string) : null,
      };
    });

    return this.tenantPrisma.forTenant(context, async (tx): Promise<ChainDto> => {
      if (dto.enabled) {
        for (const step of normalizedSteps) {
          if (step.approverType !== 'group') continue;
          const members = await tx.userGroupMember.findMany({
            where: { organizationId: context.organizationId as string, groupId: step.groupId as string },
            select: { userId: true },
          });
          const active =
            members.length > 0
              ? await tx.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, status: 'active' }, select: { id: true } })
              : [];
          if (active.length === 0) {
            throw new BadRequestException(`Group step "${step.name}" has no active members`);
          }
        }
      }

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
            groupId: step.groupId,
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

  // Single round-trip join (no relation exists between User.role and RolePermission in the
  // Prisma schema -- role is a plain string, not a FK) rather than one query per lookup.
  private async getApprovalsConfigureHolderIds(context: TenantContext): Promise<string[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT u.id AS id
        FROM users u
        INNER JOIN role_permissions rp ON rp.role = u.role
        INNER JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = 'approvals:configure' AND u.organization_id = ${context.organizationId}::uuid AND u.status = 'active'
      `;
      return rows.map((r) => r.id);
    });
  }
}
