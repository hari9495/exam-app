import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CandidateSms } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { SmsService } from '../sms/sms.service';
import { renderTemplate } from '../candidate-emails/candidate-email-render';

export interface SendSmsInput {
  templateId?: string | null;
  body: string;
  source: 'manual' | 'stage_prompt' | 'stage_auto';
}

@Injectable()
export class CandidateSmsService {
  private readonly logger = new Logger(CandidateSmsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly smsService: SmsService,
    private readonly audit: AuditService,
  ) {}

  async sendSms(
    context: TenantContext,
    actorUserId: string | null,
    entryId: string,
    input: SendSmsInput,
  ): Promise<CandidateSms | null> {
    const orgId = context.organizationId as string;

    // Phase 1 (short tx): org-scoped reads only. The Twilio call happens outside any tx,
    // same reasoning as CandidateEmailsService.sendMessage.
    const prepared = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({
        where: { id: entryId, organizationId: orgId },
        include: { candidate: true, job: true },
      });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      if (entry.candidate.erasedAt) throw new BadRequestException('Candidate has been erased');

      const phone = entry.candidate.phone;
      if (!phone || !phone.trim()) {
        if (input.source === 'manual') {
          throw new BadRequestException('Candidate has no phone number');
        }
        this.logger.log(
          `candidate-sms: skipping ${input.source} send to phoneless candidate ${entry.candidateId} (entry ${entry.id})`,
        );
        return { skipped: true as const };
      }

      if (entry.candidate.smsOptedOutAt) {
        if (input.source === 'manual') {
          throw new ConflictException('This candidate has unsubscribed from SMS');
        }
        // stage_prompt/stage_auto sends are pipeline-driven, not recruiter-initiated -- skip
        // silently rather than blocking a stage transition.
        this.logger.log(
          `candidate-sms: skipping ${input.source} send to opted-out candidate ${entry.candidateId} (entry ${entry.id})`,
        );
        return { skipped: true as const };
      }

      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
      const actorUser = actorUserId ? await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } }) : null;
      const actorName = actorUser?.name ?? '';
      return { skipped: false as const, entry, org, actorName, phone };
    });
    if (prepared.skipped) return null;
    const { entry, org, actorName, phone } = prepared;

    // Phase 2 (outside any tx): rendering + the Twilio send.
    const renderedBody = renderTemplate('', input.body, {
      candidateName: entry.candidate.name,
      jobTitle: entry.job.title,
      orgName: org?.name ?? '',
      recruiterName: actorName,
      statusLink: '',
    }).body;
    const result = await this.smsService.send({ to: phone, body: renderedBody, organizationId: orgId });

    // Phase 3 (short tx): log the outcome. Unlike email, this does NOT call
    // recomputeGlobalStage -- SMS doesn't feed the "contacted" global-stage counter (v1 scope).
    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      return tx.candidateSms.create({
        data: {
          organizationId: orgId,
          candidateId: entry.candidateId,
          pipelineEntryId: entry.id,
          templateId: input.templateId ?? null,
          toPhone: phone,
          renderedBody,
          status: result.success ? 'sent' : 'failed',
          source: input.source,
          sentByUserId: actorUserId,
          errorDetail: result.success ? null : 'delivery failed',
        },
      });
    });
    await this.audit.record(context, {
      actorUserId,
      action: result.success ? 'candidate_sms.sent' : 'candidate_sms.failed',
      entityType: 'candidate_sms',
      entityId: created.id,
      metadata: { to: phone, source: input.source },
    });
    return created;
  }

  async listMessages(context: TenantContext, candidateId: string): Promise<CandidateSms[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.candidateSms.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async resend(context: TenantContext, actorUserId: string | null, smsId: string): Promise<CandidateSms | null> {
    const existing = await this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.candidateSms.findFirst({
        where: { id: smsId, organizationId: context.organizationId as string },
      });
      if (!row) throw new NotFoundException(`Message ${smsId} not found`);
      return row;
    });
    if (existing.pipelineEntryId == null) {
      throw new BadRequestException('Cannot resend a message that is no longer linked to a pipeline entry');
    }
    return this.sendSms(context, actorUserId, existing.pipelineEntryId, {
      templateId: existing.templateId,
      body: existing.renderedBody,
      source: 'manual',
    });
  }
}
