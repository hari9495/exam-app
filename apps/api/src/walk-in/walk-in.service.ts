import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Candidate, Invitation } from '@prisma/client';
import { PrismaService, TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EmailService } from '../email/email.service';
import { buildAssessmentEmailHtml, generateToken, resolveInvitationExpiry, EMAIL_LOGO_SAS_TTL_MS } from '../invitations/invitations.service';
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
    private readonly blobStorage: BlobStorageService,
  ) {}

  private async resolveOrg(orgSlug: string): Promise<{ id: string }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) {
      throw new NotFoundException(`Organization "${orgSlug}" not found`);
    }
    return org;
  }

  // groupId scopes to exactly one walk-in group's members (a recruiter's group-specific
  // link/QR) -- walkInListed is deliberately NOT checked in that branch, since being placed
  // in a named group is itself the recruiter's explicit choice to expose the exam there,
  // independent of whether it's also in the org-wide default picker.
  async listExams(orgSlug: string, groupId?: string): Promise<WalkInExamOption[]> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: {
          organizationId: org.id,
          status: 'published',
          walkInEnabled: true,
          ...(groupId ? { walkInGroupId: groupId } : {}),
        },
        select: { id: true, title: true, durationMinutes: true, walkInListed: true },
        orderBy: { title: 'asc' },
      }),
    );
  }

  async register(orgSlug: string, dto: RegisterWalkInDto): Promise<{ token: string }> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };

    const { invitation, exam, candidate } = await this.tenantPrisma.forTenant(context, async (tx) => {
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
        return { invitation: liveInvitation, exam, candidate };
      }
      const created = await tx.invitation.create({
        data: {
          examId: exam.id,
          candidateId: candidate.id,
          token: generateToken(),
          expiresAt: resolveInvitationExpiry(exam),
          source: 'walk_in',
          // The walk-in link email below is a courtesy side channel (the candidate is
          // standing at the kiosk with a live token already) -- it isn't tracked as a
          // Notification and can't be resent, so keep the row out of the recruiter-facing
          // email lifecycle: 'pending' here would show "In queue" until someone noticed.
          emailStatus: 'none',
        },
      });
      return { invitation: created, exam, candidate };
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
    this.dispatchWalkInEmail(org.id, exam, invitation, candidate).catch((error) =>
      this.logger.error(`Failed to dispatch walk-in email for invitation ${invitation.id}`, error as Error),
    );

    return { token: invitation.token };
  }

  private async dispatchWalkInEmail(
    organizationId: string,
    exam: { title: string; durationMinutes: number; schedulingEnabled: boolean; availabilityWindowStart: Date | null },
    invitation: Invitation,
    candidate: Candidate,
  ): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/start?token=${invitation.token}`;
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { logoPath: true, name: true },
    });
    // The storage container is private -- an unsigned logoPath 403s in an email client. Sign it
    // with a long TTL (see EMAIL_LOGO_SAS_TTL_MS) since this HTML is static from send time.
    const logoUrl = (await this.blobStorage.signIfOurs(organization?.logoPath ?? null, EMAIL_LOGO_SAS_TTL_MS)) as string | null;
    // Same branded layout as recruiter invitations -- only the intro differs, since a
    // walk-in candidate registered themselves rather than being invited.
    const html = buildAssessmentEmailHtml({
      candidateName: candidate.name,
      examTitle: exam.title,
      durationMinutes: exam.durationMinutes,
      availabilityWindowStart: exam.schedulingEnabled ? exam.availabilityWindowStart : null,
      startLink: link,
      logoUrl,
      organizationName: organization?.name ?? null,
      introHtml: `Thanks for registering for the <strong>${exam.title}</strong> assessment. Everything you need is below - open this email on the device you'll use to take the exam, then use the button to begin when you are ready.`,
    });
    await this.emailService.send({
      to: candidate.email,
      subject: `Your ${exam.title} assessment - link and instructions`,
      html,
      organizationId,
    });
  }
}
