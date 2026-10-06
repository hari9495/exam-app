import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService, TenantContext, TenantPrismaService, revokeStaffSessions } from '@exam-platform/shared';
import { MfaService } from './mfa.service';
import { SessionsService } from './sessions.service';

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

// Admin-initiated MFA reset for someone who lost every factor and recovery code (YX-IAM-11).
// One admin may reset an ordinary account; a sensitive-role account needs a second, different
// admin to approve (the database enforces the "different people" part too). A reset revokes the
// person's factors, recovery codes and sessions, and makes enrolment due at their next sign-in.
@Injectable()
export class MfaResetService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly sessions: SessionsService,
  ) {}

  private orgOf(ctx: TenantContext): string {
    if (!ctx.organizationId) throw new BadRequestException('Open an organisation first');
    return ctx.organizationId;
  }

  async listPending(ctx: TenantContext) {
    const organizationId = this.orgOf(ctx);
    return this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.mfaResetRequest.findMany({
        where: { organizationId, status: 'pending', expiresAt: { gt: new Date() } },
        select: {
          id: true,
          reason: true,
          requestedByUserId: true,
          createdAt: true,
          expiresAt: true,
          targetUser: { select: { id: true, email: true, name: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async request(ctx: TenantContext, actorUserId: string, targetUserId: string, reason: string) {
    const organizationId = this.orgOf(ctx);
    if (actorUserId === targetUserId) {
      throw new ForbiddenException('You cannot reset your own two-step verification. Use a recovery code, or ask another admin.');
    }
    const target = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.user.findFirst({
        where: { id: targetUserId, organizationId },
        select: { id: true, email: true, organizationId: true, role: true, permissionProfileId: true },
      }),
    );
    if (!target) throw new NotFoundException('User not found');

    const sensitive = await this.mfa.isSensitive(target);
    let request;
    try {
      request = await this.tenantPrisma.forTenant(ctx, async (tx) => {
        // A lapsed request must not block a new one (one pending per person).
        await tx.mfaResetRequest.updateMany({ where: { targetUserId, status: 'pending', expiresAt: { lte: new Date() } }, data: { status: 'expired' } });
        return tx.mfaResetRequest.create({
          data: { organizationId, targetUserId, requestedByUserId: actorUserId, reason, expiresAt: new Date(Date.now() + REQUEST_TTL_MS) },
          select: { id: true, expiresAt: true },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('A reset for this user is already waiting for approval');
      throw error;
    }
    await this.audit.record(ctx, {
      actorUserId,
      action: 'mfa.reset_requested',
      entityType: 'user',
      entityId: targetUserId,
      metadata: { requestId: request.id, sensitive, reason },
    });

    if (!sensitive) {
      await this.execute(ctx, request.id, target, actorUserId, null);
      return { id: request.id, status: 'completed' as const };
    }
    await this.notifyOtherAdmins(organizationId, [actorUserId, targetUserId], target.email);
    return { id: request.id, status: 'pending' as const, expiresAt: request.expiresAt };
  }

  async approve(ctx: TenantContext, approverUserId: string, requestId: string) {
    const organizationId = this.orgOf(ctx);
    const request = await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.mfaResetRequest.findFirst({
        where: { id: requestId, organizationId, status: 'pending' },
        include: { targetUser: { select: { id: true, email: true, organizationId: true, role: true } } },
      }),
    );
    if (!request) throw new NotFoundException('Reset request not found');
    if (request.expiresAt <= new Date()) {
      await this.tenantPrisma.forTenant(ctx, (tx) => tx.mfaResetRequest.updateMany({ where: { id: request.id, status: 'pending' }, data: { status: 'expired' } }));
      throw new BadRequestException('This reset request has expired. Ask for a new one.');
    }
    if (approverUserId === request.requestedByUserId || approverUserId === request.targetUserId) {
      throw new ForbiddenException('A second admin, not the requester or the person being reset, must approve this.');
    }
    await this.execute(ctx, request.id, request.targetUser, request.requestedByUserId, approverUserId);
    return { id: request.id, status: 'completed' as const };
  }

  private async execute(
    ctx: TenantContext,
    requestId: string,
    target: { id: string; email: string; organizationId: string | null; role: string },
    requestedByUserId: string,
    approvedByUserId: string | null,
  ): Promise<void> {
    const now = new Date();
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      // Compare-and-set: two racing approvals complete the request once.
      const { count } = await tx.mfaResetRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'completed', approvedByUserId, completedAt: now },
      });
      if (count !== 1) throw new ConflictException('This reset request was already handled');
      await tx.authenticator.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.recoveryCode.deleteMany({ where: { userId: target.id } });
      await tx.user.update({ where: { id: target.id }, data: { mfaEnrolmentDueAt: now } });
      await revokeStaffSessions(tx, { userId: target.id }, 'mfa_reset');
    });
    await this.audit.record(ctx, {
      actorUserId: approvedByUserId ?? requestedByUserId,
      action: 'mfa.reset',
      entityType: 'user',
      entityId: target.id,
      metadata: { requestId, requestedByUserId, approvedByUserId },
    });
    this.sessions.notifySecurityChange(
      target,
      'Two-step verification on your YukthiX account was reset',
      'Your administrator reset your two-step verification and signed you out everywhere. Set it up again when you next sign in.',
    );
  }

  private async notifyOtherAdmins(organizationId: string, exclude: string[], targetEmail: string): Promise<void> {
    const admins = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.user.findMany({ where: { organizationId, role: 'org_admin', status: 'active', id: { notIn: exclude } }, select: { id: true, email: true } }),
    );
    for (const admin of admins) {
      this.sessions.notifySecurityChange(
        { ...admin, organizationId, role: 'org_admin' },
        'A two-step verification reset needs your approval',
        `An admin asked to reset two-step verification for ${targetEmail}. A second admin must approve it in Settings › People & Access › Security before it takes effect.`,
      );
    }
  }
}
