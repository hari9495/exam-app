import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Interview } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { renderInterviewTemplate, formatSlot } from './interview-render';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// ponytail: built-in copy, no per-org template lookup (unlike OfferTemplatesService) --
// nothing in this task asked for customizable invite templates, add one if that changes.
const DEFAULT_INVITE_SUBJECT = 'Interview invitation: {{jobTitle}} at {{orgName}}';
const DEFAULT_INVITE_BODY =
  "Hi {{candidateName}},\n\n" +
  "You're invited to interview for {{jobTitle}} at {{orgName}}.\n\n" +
  'Proposed times:\n{{interviewTimes}}\n\n' +
  'Location: {{interviewLocation}}\n\n' +
  'Panel: {{panelNames}}\n\n' +
  'Please confirm your preferred time here: {{confirmLink}}\n\n' +
  'Best,\n{{recruiterName}}';

@Injectable()
export class InterviewsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
  ) {}

  async createInterview(
    context: TenantContext,
    actorUserId: string,
    entryId: string,
    dto: CreateInterviewDto,
  ): Promise<Interview> {
    if (!dto.slots?.length) throw new BadRequestException('At least one slot is required');

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);

      if (dto.panelistUserIds.length) {
        const found = await tx.user.findMany({
          where: { id: { in: dto.panelistUserIds }, organizationId: orgId },
          select: { id: true },
        });
        if (found.length !== dto.panelistUserIds.length) {
          throw new BadRequestException('One or more panelists are not members of this organization');
        }
      }

      const interview = await tx.interview.create({
        data: {
          organizationId: orgId,
          pipelineEntryId: entryId,
          candidateId: entry.candidateId,
          status: 'proposed',
          location: dto.location,
          timeZone: dto.timeZone,
          recruiterNote: dto.recruiterNote ?? null,
          slots: {
            create: dto.slots.map((s) => ({ organizationId: orgId, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) })),
          },
          panelists: {
            create: dto.panelistUserIds.map((userId) => ({ organizationId: orgId, userId })),
          },
        },
        include: { slots: true, panelists: true },
      });

      await this.audit.record(context, {
        actorUserId,
        action: 'interview.created',
        entityType: 'interview',
        entityId: interview.id,
      });
      return interview;
    });
  }

  async listForEntry(context: TenantContext, entryId: string): Promise<Interview[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.interview.findMany({
        where: { organizationId: context.organizationId as string, pipelineEntryId: entryId },
        include: { slots: true, panelists: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listForCandidate(context: TenantContext, candidateId: string): Promise<Interview[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.interview.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        include: { slots: true, panelists: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async listMine(context: TenantContext, userId: string): Promise<Interview[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.interview.findMany({
        where: { organizationId: context.organizationId as string, panelists: { some: { userId } } },
        include: { slots: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async cancel(context: TenantContext, actorUserId: string, interviewId: string): Promise<Interview> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const interview = await tx.interview.findFirst({ where: { id: interviewId, organizationId: orgId } });
      if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);

      const updated = await tx.interview.update({ where: { id: interviewId }, data: { status: 'cancelled' } });
      await this.audit.record(context, {
        actorUserId,
        action: 'interview.cancelled',
        entityType: 'interview',
        entityId: interviewId,
      });
      return updated;
    });
  }

  async sendInvite(context: TenantContext, actorUserId: string, interviewId: string): Promise<Interview> {
    const orgId = context.organizationId as string;

    // Phase 1 (short tx): org-scoped read + interviewToken mint. No network calls here -- forTenant
    // uses Prisma's default 5s interactive-transaction timeout, and the SMTP sends below (one to
    // the candidate, one per panelist) can take longer than that (see OffersService.sendOffer,
    // which follows the same three-phase shape for the same reason).
    const prep = await this.tenantPrisma.forTenant(context, async (tx) => {
      const interview = await tx.interview.findFirst({
        where: { id: interviewId, organizationId: orgId },
        include: {
          pipelineEntry: { include: { candidate: true, job: true } },
          slots: { orderBy: { startsAt: 'asc' } },
          panelists: true,
        },
      });
      if (!interview) throw new NotFoundException(`Interview ${interviewId} not found`);
      if (interview.pipelineEntry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');
      if (interview.status !== 'proposed') throw new BadRequestException('Interview is not in a proposed state');

      let interviewToken = interview.interviewToken;
      if (!interviewToken) {
        interviewToken = randomUUID();
        await tx.interview.update({ where: { id: interviewId }, data: { interviewToken } });
      }

      const panelistUserIds = interview.panelists.map((p) => p.userId);
      const panelists = panelistUserIds.length
        ? await tx.user.findMany({
            where: { id: { in: panelistUserIds }, organizationId: orgId },
            select: { id: true, email: true, name: true },
          })
        : [];

      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      const actorName = actorUserId
        ? ((await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '')
        : '';

      return {
        interview,
        candidate: interview.pipelineEntry.candidate,
        job: interview.pipelineEntry.job,
        panelists,
        org,
        actorName,
        interviewToken,
      };
    });

    // Phase 2 (outside any tx): rendering + network calls (blob signing, SMTP sends). candidateName
    // and jobTitle are attacker-controlled (candidate name comes from the public apply form) so they
    // are only ever interpolated into plain bodyText and rendered via buildCandidateEmailHtml, which
    // HTML-escapes it -- never hand-built into raw HTML.
    const confirmLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/interview/${prep.interviewToken}`;
    const interviewTimes = prep.interview.slots.map((s) => formatSlot(s.startsAt, s.endsAt, prep.interview.timeZone)).join('\n');
    const panelNames = prep.panelists.map((p) => p.name).join(', ');
    const rendered = renderInterviewTemplate(DEFAULT_INVITE_SUBJECT, DEFAULT_INVITE_BODY, {
      candidateName: prep.candidate.name,
      jobTitle: prep.job.title,
      orgName: prep.org?.name ?? '',
      recruiterName: prep.actorName,
      interviewTimes,
      interviewLocation: prep.interview.location,
      panelNames,
      confirmLink,
    });
    const bodyText = prep.interview.recruiterNote ? `${rendered.body}\n\n${prep.interview.recruiterNote}` : rendered.body;
    const logoUrl = prep.org?.logoPath ? await this.blobStorage.signIfOurs(prep.org.logoPath, LOGO_SIGN_TTL_MS) : null;
    const html = buildCandidateEmailHtml({ logoUrl: logoUrl as string | null, orgName: prep.org?.name ?? null, bodyText });
    const result = await this.emailService.send({
      to: prep.candidate.email,
      subject: rendered.subject,
      html,
      organizationId: orgId,
    });

    for (const panelist of prep.panelists) {
      await this.emailService.send({
        to: panelist.email,
        subject: `Interview panel assignment: ${prep.candidate.name} for ${prep.job.title}`,
        html: buildCandidateEmailHtml({
          logoUrl: null,
          orgName: null,
          bodyText:
            `You are assigned to interview ${prep.candidate.name} for ${prep.job.title}.\n` +
            `Proposed times:\n${interviewTimes}\n` +
            `Location: ${prep.interview.location}\n` +
            `(Pending the candidate's confirmation.)`,
        }),
        organizationId: orgId,
      });
    }

    // Phase 3 (short tx): log the outcome. A failed candidate send leaves the interview un-sent so
    // the recruiter can retry -- panelist send failures are not checked here and never block this.
    return this.tenantPrisma.forTenant(context, async (tx) => {
      if (!result.success) {
        await this.audit.record(context, {
          actorUserId,
          action: 'interview.send_failed',
          entityType: 'interview',
          entityId: interviewId,
          metadata: { to: prep.candidate.email },
        });
        return prep.interview;
      }
      const updated = await tx.interview.update({
        where: { id: interviewId },
        data: { sentAt: new Date(), sentByUserId: actorUserId },
      });
      await this.audit.record(context, {
        actorUserId,
        action: 'interview.invited',
        entityType: 'interview',
        entityId: interviewId,
        metadata: { to: prep.candidate.email },
      });
      return updated;
    });
  }
}
