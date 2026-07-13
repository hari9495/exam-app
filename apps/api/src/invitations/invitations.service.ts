import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Candidate, Invitation } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';

const INVITATION_EXPIRY_DAYS = 7;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface BulkInviteResult {
  created: Invitation[];
  skipped: { candidateId: string; reason: string }[];
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  async bulkInvite(context: TenantContext, examId: string, candidateIds: string[]): Promise<BulkInviteResult> {
    const uniqueCandidateIds = [...new Set(candidateIds)];

    const { examTitle, createdWithCandidate, skipped } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      if (exam.status !== 'published') {
        throw new BadRequestException(`Exam ${examId} must be published before candidates can be invited`);
      }

      const candidates = await tx.candidate.findMany({
        where: { id: { in: uniqueCandidateIds }, organizationId: context.organizationId as string },
      });
      const foundIds = new Set(candidates.map((c) => c.id));
      const missingIds = uniqueCandidateIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new NotFoundException(`One or more candidates were not found in this organization: ${missingIds.join(', ')}`);
      }

      const liveInvitations = await tx.invitation.findMany({
        where: { examId, candidateId: { in: uniqueCandidateIds }, status: 'invited', expiresAt: { gt: new Date() } },
        select: { candidateId: true },
      });
      const alreadyInvitedIds = new Set(liveInvitations.map((i) => i.candidateId));

      const createdWithCandidate: { invitation: Invitation; candidate: Candidate }[] = [];
      const skipped: { candidateId: string; reason: string }[] = [];

      for (const candidate of candidates) {
        if (alreadyInvitedIds.has(candidate.id)) {
          skipped.push({ candidateId: candidate.id, reason: 'Candidate already has a live invitation for this exam' });
          continue;
        }
        const invitation = await tx.invitation.create({
          data: {
            examId,
            candidateId: candidate.id,
            token: generateToken(),
            expiresAt: addDays(new Date(), INVITATION_EXPIRY_DAYS),
          },
        });
        createdWithCandidate.push({ invitation, candidate });
      }

      return { examTitle: exam.title, createdWithCandidate, skipped };
    });

    for (const { invitation, candidate } of createdWithCandidate) {
      await this.dispatchInvitationEmail(context, examTitle, invitation, candidate);
    }

    return { created: createdWithCandidate.map((c) => c.invitation), skipped };
  }

  async list(context: TenantContext, examId: string): Promise<(Omit<Invitation, 'token'> & { candidate: Candidate })[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      return tx.invitation.findMany({
        where: { examId },
        select: {
          id: true,
          examId: true,
          candidateId: true,
          status: true,
          invitedAt: true,
          expiresAt: true,
          revokedAt: true,
          activeSessionFamilyId: true,
          candidate: true,
        },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });
    });
  }

  async resend(context: TenantContext, invitationId: string): Promise<Invitation> {
    const { invitation, examTitle, candidate } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
        include: { exam: true, candidate: true },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.status !== 'invited') {
        throw new BadRequestException(`Invitation ${invitationId} cannot be resent from status "${existing.status}"`);
      }
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: { token: generateToken(), expiresAt: addDays(new Date(), INVITATION_EXPIRY_DAYS) },
      });
      return { invitation: updated, examTitle: existing.exam.title, candidate: existing.candidate };
    });

    await this.dispatchInvitationEmail(context, examTitle, invitation, candidate);
    return invitation;
  }

  async revoke(context: TenantContext, actorUserId: string, invitationId: string): Promise<Invitation> {
    const { invitation, didRevoke } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.status === 'revoked') {
        return { invitation: existing, didRevoke: false };
      }
      const updated = await tx.invitation.update({ where: { id: invitationId }, data: { status: 'revoked', revokedAt: new Date() } });
      return { invitation: updated, didRevoke: true };
    });
    if (didRevoke) {
      await this.audit.record(context, {
        actorUserId,
        action: 'invitation.revoked',
        entityType: 'invitation',
        entityId: invitationId,
      });
    }
    return invitation;
  }

  private async dispatchInvitationEmail(
    context: TenantContext,
    examTitle: string,
    invitation: Invitation,
    candidate: Candidate,
  ): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invite/${invitation.token}`;
    const result = await this.emailService.send({
      to: candidate.email,
      subject: "You've been invited to an exam",
      html: `<p>You have been invited to take "${examTitle}".</p><p><a href="${link}">${link}</a></p>`,
    });
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.notification.create({
        data: {
          invitationId: invitation.id,
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
        },
      }),
    );
  }
}
