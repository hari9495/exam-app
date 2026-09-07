import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CandidateEmail } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { renderTemplate, templateReferencesStatusLink, buildCandidateEmailHtml } from './candidate-email-render';
import { recomputeGlobalStage } from '../candidates/recompute-global-stage';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface SendMessageInput {
  templateId?: string | null;
  subject: string;
  body: string;
  source: 'manual' | 'stage_prompt' | 'stage_auto';
  senderAddressId?: string;
}

@Injectable()
export class CandidateEmailsService {
  private readonly logger = new Logger(CandidateEmailsService.name);

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
    options?: { appendSignature?: boolean },
  ): Promise<CandidateEmail | null> {
    const appendSignature = options?.appendSignature ?? true;
    const orgId = context.organizationId as string;

    // Phase 1 (short tx): org-scoped reads + the applicationToken/unsubscribeToken mints. No
    // network calls here -- forTenant uses Prisma's default 5s interactive-transaction timeout,
    // and SMTP can take longer than that on a cold start (see sendEmail below, which runs outside
    // any tx).
    const prepared = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        include: { candidate: true, job: true },
      });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      if (entry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

      if (entry.candidate.emailOptedOutAt) {
        if (input.source === 'manual') {
          throw new ConflictException('This candidate has unsubscribed from emails');
        }
        // stage_prompt/stage_auto sends are pipeline-driven, not recruiter-initiated -- skip
        // silently rather than blocking a stage transition.
        this.logger.log(
          `candidate-emails: skipping ${input.source} send to opted-out candidate ${entry.candidateId} (entry ${entry.id})`,
        );
        return { skipped: true as const };
      }

      let unsubscribeToken = entry.candidate.unsubscribeToken;
      if (!unsubscribeToken) {
        unsubscribeToken = randomUUID();
        await tx.candidate.update({ where: { id: entry.candidateId }, data: { unsubscribeToken } });
      }

      let applicationToken = entry.applicationToken;
      if (!applicationToken && templateReferencesStatusLink(input.subject, input.body)) {
        applicationToken = randomUUID();
        await tx.pipelineEntry.update({ where: { id: entry.id }, data: { applicationToken } });
      }
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      const actorUser = actorUserId
        ? await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true, emailSignature: true } })
        : null;
      const actorName = actorUser?.name ?? '';
      const actorSignature = actorUser?.emailSignature ?? null;
      let fromAddress: string | undefined;
      if (input.senderAddressId) {
        const sender = await tx.orgSenderAddress.findFirst({
          where: { id: input.senderAddressId, organizationId: orgId },
        });
        if (!sender) throw new NotFoundException(`Sender address ${input.senderAddressId} not found`);
        fromAddress = sender.address;
      }
      return { skipped: false as const, entry, applicationToken, org, actorName, actorSignature, unsubscribeToken, fromAddress };
    });
    if (prepared.skipped) return null;
    const { entry, applicationToken, org, actorName, actorSignature, unsubscribeToken, fromAddress } = prepared;

    // Phase 2 (outside any tx): rendering + network calls (blob signing, SMTP send).
    const statusLink = applicationToken
      ? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/application/${applicationToken}`
      : '';
    const unsubscribeUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/unsubscribe/${unsubscribeToken}`;
    const rendered = renderTemplate(input.subject, input.body, {
      candidateName: entry.candidate.name,
      jobTitle: entry.job.title,
      orgName: org?.name ?? '',
      recruiterName: actorName,
      statusLink,
    });
    const signature = appendSignature && actorUserId ? (actorSignature ?? '').trim() : '';
    const bodyWithSignature = signature ? `${rendered.body}\n\n--\n${signature}` : rendered.body;
    const logoUrl = org?.logoPath ? await this.blobStorage.signIfOurs(org.logoPath, LOGO_SIGN_TTL_MS) : null;
    const html = buildCandidateEmailHtml({
      logoUrl: logoUrl as string | null,
      orgName: org?.name ?? null,
      bodyText: bodyWithSignature,
      unsubscribeUrl,
    });
    const result = await this.emailService.send({
      to: entry.candidate.email,
      subject: rendered.subject,
      html,
      organizationId: orgId,
      ...(fromAddress ? { fromAddress } : {}),
    });

    // Phase 3 (short tx): log the outcome, whatever it was, then recompute the candidate's
    // global stage -- recomputeGlobalStage counts candidateEmail rows to decide "contacted",
    // so it must run after the row above is created, in the same tx.
    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.candidateEmail.create({
        data: {
          organizationId: orgId,
          candidateId: entry.candidateId,
          pipelineEntryId: entry.id,
          templateId: input.templateId ?? null,
          toEmail: entry.candidate.email,
          subject: rendered.subject,
          renderedBody: bodyWithSignature,
          status: result.success ? 'sent' : 'failed',
          source: input.source,
          sentByUserId: actorUserId,
          errorDetail: result.success ? null : 'delivery failed',
        },
      });
      await recomputeGlobalStage(tx, orgId, entry.candidateId);
      return row;
    });
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

  async resend(context: TenantContext, actorUserId: string | null, messageId: string): Promise<CandidateEmail | null> {
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
    return this.sendMessage(
      context,
      actorUserId,
      existing.pipelineEntryId,
      {
        templateId: existing.templateId,
        subject: existing.subject,
        body: existing.renderedBody,
        source: 'manual',
      },
      // existing.renderedBody is already the final, signed body from the original send --
      // sendMessage must not append the signature again or a resend double-signs.
      { appendSignature: false },
    );
  }
}
