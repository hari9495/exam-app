import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Candidate, Invitation } from '@prisma/client';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailService } from '../email/email.service';
import { generateToken, resolveInvitationExpiry } from '../invitations/invitations.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';

export interface WalkInExamOption {
  id: string;
  title: string;
  durationMinutes: number;
  walkInListed: boolean;
}

@Injectable()
export class WalkInService {
  private readonly logger = new Logger(WalkInService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly emailService: EmailService,
  ) {}

  private async resolveOrg(orgSlug: string): Promise<{ id: string }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) {
      throw new NotFoundException(`Organization "${orgSlug}" not found`);
    }
    return org;
  }

  async listExams(orgSlug: string): Promise<WalkInExamOption[]> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: { organizationId: org.id, status: 'published', walkInEnabled: true },
        select: { id: true, title: true, durationMinutes: true, walkInListed: true },
        orderBy: { title: 'asc' },
      }),
    );
  }

  async register(orgSlug: string, dto: RegisterWalkInDto): Promise<{ token: string }> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };

    const { invitation, examTitle, candidate } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: dto.examId, organizationId: org.id } });
      if (!exam || exam.status !== 'published' || !exam.walkInEnabled) {
        throw new BadRequestException('This exam is not currently open for walk-in registration');
      }

      // Public, unauthenticated endpoint: unlike bulkUploadAndInvite (recruiter-authenticated),
      // an existing candidate match must NOT be overwritten with request-body name/phone --
      // anyone who knows a candidate's email could tamper with their stored details.
      const existingCandidate = await tx.candidate.findFirst({ where: { organizationId: org.id, email: dto.email } });
      const candidate =
        existingCandidate ??
        (await tx.candidate.create({
          data: { organizationId: org.id, email: dto.email, name: dto.name, phone: dto.phone },
        }));

      const liveInvitation = await tx.invitation.findFirst({
        where: { examId: exam.id, candidateId: candidate.id, status: 'invited', expiresAt: { gt: new Date() } },
      });
      if (liveInvitation) {
        return { invitation: liveInvitation, examTitle: exam.title, candidate };
      }
      const created = await tx.invitation.create({
        data: {
          examId: exam.id,
          candidateId: candidate.id,
          token: generateToken(),
          expiresAt: resolveInvitationExpiry(exam),
          source: 'walk_in',
        },
      });
      return { invitation: created, examTitle: exam.title, candidate };
    });

    await this.audit.record(context, {
      actorUserId: null,
      action: 'invitation.created',
      entityType: 'invitation',
      metadata: { count: 1, source: 'walk_in' },
    });
    await this.webhooks.enqueue(org.id, 'invitation.created', {
      id: invitation.id,
      examId: invitation.examId,
      candidateId: invitation.candidateId,
      status: invitation.status,
    });

    // Fire-and-forget, same rationale as InvitationsService.dispatchInvitationEmail: email
    // delivery is a notification side effect, not part of the transactional outcome of
    // registering (the invitation + token already exist in the DB regardless of email success).
    // The candidate registers from whatever device is at the walk-in kiosk (often a phone via
    // QR scan), which can't run the exam UI -- always emailing the link, instead of returning
    // it for an immediate same-device redirect, lets them open it later on a proper device.
    this.dispatchWalkInEmail(org.id, examTitle, invitation, candidate).catch((error) =>
      this.logger.error(`Failed to dispatch walk-in email for invitation ${invitation.id}`, error as Error),
    );

    return { token: invitation.token };
  }

  private async dispatchWalkInEmail(organizationId: string, examTitle: string, invitation: Invitation, candidate: Candidate): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/start?token=${invitation.token}`;
    await this.emailService.send({
      to: candidate.email,
      subject: `Your link to start "${examTitle}"`,
      html: `<p>Thanks for registering for "${examTitle}".</p><p>Open this link on the device you'll use to take the exam:</p><p><a href="${link}">${link}</a></p>`,
      organizationId,
    });
  }
}
