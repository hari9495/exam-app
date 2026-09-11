import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CandidateWhatsapp } from '@prisma/client';
import { TenantPrismaService, TenantContext, AuditService } from '@exam-platform/shared';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { renderTemplate } from '../candidate-emails/candidate-email-render';

export interface SendWhatsappInput {
  templateId?: string | null;
  body: string;
  source: 'manual' | 'stage_prompt' | 'stage_auto';
}

@Injectable()
export class CandidateWhatsappService {
  private readonly logger = new Logger(CandidateWhatsappService.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async sendWhatsapp(
    context: TenantContext,
    actorUserId: string | null,
    entryId: string,
    input: SendWhatsappInput,
  ): Promise<CandidateWhatsapp | null> {
    const orgId = context.organizationId as string;

    // Phase 1 (short tx): org-scoped reads only. No network calls -- the WhatsApp send
    // happens outside any tx, below.
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
          `candidate-whatsapp: skipping ${input.source} send to phone-less candidate ${entry.candidateId} (entry ${entry.id})`,
        );
        return { skipped: true as const };
      }

      if (entry.candidate.whatsappOptedOutAt) {
        if (input.source === 'manual') {
          throw new ConflictException('This candidate has opted out of WhatsApp');
        }
        this.logger.log(
          `candidate-whatsapp: skipping ${input.source} send to opted-out candidate ${entry.candidateId} (entry ${entry.id})`,
        );
        return { skipped: true as const };
      }

      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
      const actorUser = actorUserId
        ? await tx.user.findUnique({ where: { id: actorUserId }, select: { name: true } })
        : null;
      const actorName = actorUser?.name ?? '';
      return { skipped: false as const, entry, phone, org, actorName };
    });
    if (prepared.skipped) return null;
    const { entry, phone, org, actorName } = prepared;

    // Phase 2 (outside any tx): rendering + the network call to the WhatsApp provider.
    const rendered = renderTemplate('', input.body, {
      candidateName: entry.candidate.name,
      jobTitle: entry.job.title,
      orgName: org?.name ?? '',
      recruiterName: actorName,
      statusLink: '',
    }).body;
    const result = await this.whatsappService.send({ to: phone, body: rendered, organizationId: orgId });

    // Phase 3 (short tx): log the outcome, whatever it was. NO recomputeGlobalStage --
    // WhatsApp does not feed the candidate's "contacted" global-stage signal (spec: out of scope).
    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      return tx.candidateWhatsapp.create({
        data: {
          organizationId: orgId,
          candidateId: entry.candidateId,
          pipelineEntryId: entry.id,
          templateId: input.templateId ?? null,
          toPhone: phone,
          renderedBody: rendered,
          status: result.success ? 'sent' : 'failed',
          source: input.source,
          sentByUserId: actorUserId,
          errorDetail: result.success ? null : 'delivery failed',
        },
      });
    });
    await this.audit.record(context, {
      actorUserId,
      action: result.success ? 'candidate_whatsapp.sent' : 'candidate_whatsapp.failed',
      entityType: 'candidate_whatsapp',
      entityId: created.id,
      metadata: { to: phone, source: input.source },
    });
    return created;
  }

  async listMessages(context: TenantContext, candidateId: string): Promise<CandidateWhatsapp[]> {
    return this.tenantPrisma.forTenant(context, async (tx) =>
      tx.candidateWhatsapp.findMany({
        where: { organizationId: context.organizationId as string, candidateId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async resend(context: TenantContext, actorUserId: string | null, messageId: string): Promise<CandidateWhatsapp | null> {
    const existing = await this.tenantPrisma.forTenant(context, async (tx) => {
      const row = await tx.candidateWhatsapp.findFirst({
        where: { id: messageId, organizationId: context.organizationId as string },
      });
      if (!row) throw new NotFoundException(`Message ${messageId} not found`);
      return row;
    });
    if (existing.pipelineEntryId == null) {
      throw new BadRequestException('Cannot resend a message that is no longer linked to a pipeline entry');
    }
    return this.sendWhatsapp(context, actorUserId, existing.pipelineEntryId, {
      templateId: existing.templateId,
      body: existing.renderedBody,
      source: 'manual',
    });
  }
}
