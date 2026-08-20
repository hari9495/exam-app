import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Interview } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { IntegrationEventsService } from '../integrations/integration-events.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { RespondInterviewDto } from './dto/respond-interview.dto';
import { renderInterviewTemplate, formatSlot } from './interview-render';
import { buildInterviewIcs } from './interview-ics';

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
  // interviews is RLS-protected and there is no org context until the interviewToken resolves
  // one. The super-admin flag on forTenant bypasses the RLS predicate entirely -- same pattern
  // as OffersService.LOOKUP_ORG / PublicApplicationsService.LOOKUP_ORG; this placeholder org is
  // never used for filtering.
  private readonly LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
    private readonly integrationEvents: IntegrationEventsService,
  ) {}

  async createInterview(
    context: TenantContext,
    actorUserId: string,
    entryId: string,
    dto: CreateInterviewDto,
  ): Promise<Interview> {
    if (!dto.slots?.length) throw new BadRequestException('At least one slot is required');
    if (dto.slots.some((s) => new Date(s.endsAt).getTime() <= new Date(s.startsAt).getTime())) {
      throw new BadRequestException('Each slot must end after it starts');
    }

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

  private async resolveInterviewByToken(token: string) {
    const interview = await this.tenantPrisma.forTenant(
      { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
      (tx) =>
        tx.interview.findUnique({
          where: { interviewToken: token },
          select: {
            id: true,
            organizationId: true,
            pipelineEntryId: true,
            status: true,
            location: true,
            timeZone: true,
            recruiterNote: true,
            confirmedSlotId: true,
            sentByUserId: true,
            slots: { select: { id: true, startsAt: true, endsAt: true } },
          },
        }),
    );
    // Generic message regardless of which condition failed later (already responded, unknown
    // slot) -- distinguishing "no such token" from a state failure would give an outsider an
    // oracle. Same reasoning as OffersService.resolveOfferByToken.
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  async getPublicInterview(token: string) {
    const interview = await this.resolveInterviewByToken(token);

    const details = await this.tenantPrisma.forTenant(
      { organizationId: interview.organizationId, isSuperAdmin: true },
      async (tx) => {
        const entry = await tx.pipelineEntry.findUnique({
          where: { id: interview.pipelineEntryId },
          select: { job: { select: { title: true } } },
        });
        const org = await tx.organization.findUnique({ where: { id: interview.organizationId }, select: { name: true } });
        const panelistRows = await tx.interviewPanelist.findMany({
          where: { interviewId: interview.id },
          select: { userId: true },
        });
        const panelUsers = panelistRows.length
          ? await tx.user.findMany({ where: { id: { in: panelistRows.map((p) => p.userId) } }, select: { name: true } })
          : [];
        return { jobTitle: entry?.job.title ?? '', orgName: org?.name ?? '', panel: panelUsers.map((u) => firstName(u.name)) };
      },
    );

    return {
      jobTitle: details.jobTitle,
      orgName: details.orgName,
      slots: interview.slots.map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt })),
      location: interview.location,
      timeZone: interview.timeZone,
      panel: details.panel,
      status: interview.status,
      confirmedSlotId: interview.confirmedSlotId,
    };
  }

  async respondPublic(
    token: string,
    dto: RespondInterviewDto,
  ): Promise<{ status: string; confirmedSlotId: string | null; candidateReschedNote: string | null; respondedAt: Date }> {
    const interview = await this.resolveInterviewByToken(token);
    // Generic conflict message -- same anti-oracle reasoning as the NotFound above, just
    // surfaced as a 409 once the token itself is known-good.
    if (interview.status !== 'proposed') {
      throw new ConflictException('This interview invitation is no longer available');
    }

    let chosenSlot: { id: string; startsAt: Date; endsAt: Date } | undefined;
    if (dto.action === 'confirm') {
      chosenSlot = interview.slots.find((s) => s.id === dto.slotId);
      // A missing/unknown slotId gets the same generic message as any other conflict -- it
      // must not tell the caller whether the slot exists on some *other* interview.
      if (!chosenSlot) throw new ConflictException('This interview invitation is no longer available');
    }

    const context = { organizationId: interview.organizationId, isSuperAdmin: true };
    const statusByAction = {
      confirm: 'confirmed',
      decline: 'declined',
      reschedule: 'reschedule_requested',
    } as const;
    const auditActionByAction = {
      confirm: 'interview.confirmed',
      decline: 'interview.declined',
      reschedule: 'interview.reschedule_requested',
    } as const;

    const updated = await this.tenantPrisma.forTenant(context, async (tx) => {
      const respondedAt = new Date();
      const data: Record<string, unknown> = { status: statusByAction[dto.action], respondedAt };
      if (dto.action === 'confirm') data.confirmedSlotId = chosenSlot!.id;
      if (dto.action === 'reschedule') data.candidateReschedNote = dto.note ?? null;

      // Compound-precondition write, not a pre-tx-guarded update: two concurrent public
      // requests (double-click, retry) can both pass the status check above, but only one can
      // flip status:'proposed' -> the new status here. The loser gets count:0 and must not
      // write an audit row or trigger any notification -- same generic message, no oracle.
      const result = await tx.interview.updateMany({
        where: { id: interview.id, organizationId: interview.organizationId, status: 'proposed' },
        data,
      });
      if (result.count === 0) {
        throw new ConflictException('This interview invitation is no longer available');
      }
      await this.audit.record(context, {
        actorUserId: null,
        action: auditActionByAction[dto.action],
        entityType: 'interview',
        entityId: interview.id,
      });
      // Public endpoint: return only candidate-safe fields. Never spread the resolved `interview`
      // (it carries organizationId, pipelineEntryId, sentByUserId) back to an unauthenticated
      // caller -- same shaping discipline as getPublicInterview.
      return {
        status: data.status as string,
        confirmedSlotId: (data.confirmedSlotId as string | undefined) ?? interview.confirmedSlotId ?? null,
        candidateReschedNote: (data.candidateReschedNote as string | null | undefined) ?? null,
        respondedAt: data.respondedAt as Date,
      };
    });

    // Notifications: OUTSIDE the tx above -- emailService.send is a network call and must never
    // run inside a forTenant callback (same three-phase reasoning as sendInvite/OffersService).
    const notify = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findUnique({
        where: { id: interview.pipelineEntryId },
        select: { candidate: { select: { name: true, email: true } }, job: { select: { title: true } } },
      });
      const org = await tx.organization.findUnique({ where: { id: interview.organizationId }, select: { name: true } });
      const recruiter = interview.sentByUserId
        ? await tx.user.findUnique({ where: { id: interview.sentByUserId }, select: { email: true } })
        : null;

      let panelists: { email: string; name: string | null }[] = [];
      if (dto.action === 'confirm') {
        const panelistRows = await tx.interviewPanelist.findMany({
          where: { interviewId: interview.id },
          select: { userId: true },
        });
        panelists = panelistRows.length
          ? await tx.user.findMany({ where: { id: { in: panelistRows.map((p) => p.userId) } }, select: { email: true, name: true } })
          : [];
      }

      return {
        candidateName: entry?.candidate.name ?? '',
        candidateEmail: entry?.candidate.email ?? '',
        jobTitle: entry?.job.title ?? '',
        orgName: org?.name ?? '',
        recruiterEmail: recruiter?.email,
        panelists,
      };
    });

    if (dto.action === 'confirm') {
      // candidateName/jobTitle are attacker-controlled (candidate name comes from the public
      // apply form) so they are only ever interpolated into plain bodyText and rendered via
      // buildCandidateEmailHtml, which HTML-escapes it -- never hand-built into raw HTML. The
      // ICS text fields are separately escaped by buildInterviewIcs.
      const ics = buildInterviewIcs({
        uid: interview.id,
        startsAt: chosenSlot!.startsAt,
        endsAt: chosenSlot!.endsAt,
        summary: `Interview: ${notify.candidateName} — ${notify.jobTitle}`,
        location: interview.location,
        description: interview.recruiterNote ?? '',
      });
      const icsAttachment = { filename: 'interview.ics', content: Buffer.from(ics) };
      const when = formatSlot(chosenSlot!.startsAt, chosenSlot!.endsAt, interview.timeZone);

      await this.emailService.send({
        to: notify.candidateEmail,
        subject: `Interview confirmed: ${notify.jobTitle}`,
        html: buildCandidateEmailHtml({
          logoUrl: null,
          orgName: notify.orgName || null,
          bodyText: `Your interview for ${notify.jobTitle} at ${notify.orgName} is confirmed for ${when}.\n\nLocation: ${interview.location}`,
        }),
        organizationId: interview.organizationId,
        attachments: [icsAttachment],
      });

      for (const panelist of notify.panelists) {
        await this.emailService.send({
          to: panelist.email,
          subject: `Interview confirmed: ${notify.candidateName} for ${notify.jobTitle}`,
          html: buildCandidateEmailHtml({
            logoUrl: null,
            orgName: null,
            bodyText: `${notify.candidateName} confirmed for ${when}.\n\nLocation: ${interview.location}`,
          }),
          organizationId: interview.organizationId,
          attachments: [icsAttachment],
        });
      }

      if (notify.recruiterEmail) {
        await this.emailService.send({
          to: notify.recruiterEmail,
          subject: `Interview confirmed: ${notify.candidateName}`,
          html: buildCandidateEmailHtml({
            logoUrl: null,
            orgName: null,
            bodyText: `${notify.candidateName} confirmed the interview for ${notify.jobTitle} (${when}).`,
          }),
          organizationId: interview.organizationId,
        });
      }

      await this.integrationEvents.emit(interview.organizationId, 'interview.confirmed', {
        subject: notify.candidateName,
        slotTime: chosenSlot!.startsAt.toISOString(),
        linkPath: `/interviews/${interview.id}`,
      });
    } else if (notify.recruiterEmail) {
      const verb = dto.action === 'decline' ? 'declined' : 'requested a reschedule for';
      const noteText = dto.action === 'reschedule' && dto.note ? `\n\nCandidate's note: ${dto.note}` : '';
      await this.emailService.send({
        to: notify.recruiterEmail,
        subject: `Interview ${dto.action === 'decline' ? 'declined' : 'reschedule requested'}: ${notify.candidateName}`,
        html: buildCandidateEmailHtml({
          logoUrl: null,
          orgName: null,
          bodyText: `${notify.candidateName} ${verb} the interview for ${notify.jobTitle}.${noteText}`,
        }),
        organizationId: interview.organizationId,
      });
    }

    return updated;
  }
}

function firstName(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
