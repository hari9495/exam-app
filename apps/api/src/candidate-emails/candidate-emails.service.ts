import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CandidateEmail } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { renderTemplate, templateReferencesStatusLink, buildCandidateEmailHtml } from './candidate-email-render';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface SendMessageInput {
  templateId?: string | null;
  subject: string;
  body: string;
  source: 'manual' | 'stage_prompt' | 'stage_auto';
}

@Injectable()
export class CandidateEmailsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
  ) {}

  async sendMessage(
    context: TenantContext,
    actorUserId: string | null,
    entryId: string,
    input: SendMessageInput,
  ): Promise<CandidateEmail> {
    const orgId = context.organizationId as string;

    // Phase 1 (short tx): org-scoped reads + the applicationToken mint. No network calls here --
    // forTenant uses Prisma's default 5s interactive-transaction timeout, and SMTP can take longer
    // than that on a cold start (see sendEmail below, which runs outside any tx).
    const prepared = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        include: { candidate: true, job: true },
      });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      if (entry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

      let applicationToken = entry.applicationToken;
      if (!applicationToken && templateReferencesStatusLink(input.subject, input.body)) {
        applicationToken = randomUUID();
        await tx.pipelineEntry.update({ where: { id: entry.id }, data: { applicationToken } });
      }
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      const actorName = actorUserId
        ? ((await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }))?.name ?? '')
        : '';
      return { entry, applicationToken, org, actorName };
    });
    const { entry, applicationToken, org, actorName } = prepared;

    // Phase 2 (outside any tx): rendering + network calls (blob signing, SMTP send).
    const statusLink = applicationToken
      ? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/application/${applicationToken}`
      : '';
    const rendered = renderTemplate(input.subject, input.body, {
      candidateName: entry.candidate.name,
      jobTitle: entry.job.title,
      orgName: org?.name ?? '',
      recruiterName: actorName,
      statusLink,
    });
    const logoUrl = org?.logoPath ? await this.blobStorage.signIfOurs(org.logoPath, LOGO_SIGN_TTL_MS) : null;
    const html = buildCandidateEmailHtml({ logoUrl: logoUrl as string | null, orgName: org?.name ?? null, bodyText: rendered.body });
    const result = await this.emailService.send({
      to: entry.candidate.email,
      subject: rendered.subject,
      html,
      organizationId: orgId,
    });

    // Phase 3 (short tx): log the outcome, whatever it was.
    const created = await this.tenantPrisma.forTenant(context, async (tx) =>
      tx.candidateEmail.create({
        data: {
          organizationId: orgId,
          candidateId: entry.candidateId,
          pipelineEntryId: entry.id,
          templateId: input.templateId ?? null,
          toEmail: entry.candidate.email,
          subject: rendered.subject,
          renderedBody: rendered.body,
          status: result.success ? 'sent' : 'failed',
          source: input.source,
          sentByUserId: actorUserId,
          errorDetail: result.success ? null : 'delivery failed',
        },
      }),
    );
    await this.audit.record(context, {
      actorUserId,
      action: result.success ? 'candidate_email.sent' : 'candidate_email.failed',
      entityType: 'candidate_email',
      entityId: created.id,
      metadata: { to: entry.candidate.email, source: input.source },
    });
    return created;
  }

  async listMessages(context: TenantContext, candidateId: string): Promise<CandidateEmail[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.candidateEmail.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async resend(context: TenantContext, actorUserId: string | null, messageId: string): Promise<CandidateEmail> {
    const existing = await this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.candidateEmail.findFirst({
        where: { id: messageId, organizationId: context.organizationId as string },
      });
      if (!row) throw new NotFoundException(`Message ${messageId} not found`);
      return row;
    });
    if (existing.pipelineEntryId == null) {
      throw new BadRequestException('Cannot resend a message that is no longer linked to a pipeline entry');
    }
    return this.sendMessage(context, actorUserId, existing.pipelineEntryId, {
      templateId: existing.templateId,
      subject: existing.subject,
      body: existing.renderedBody,
      source: 'manual',
    });
  }
}
