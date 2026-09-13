import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AiInvocationService } from './ai-invocation.service';
import { JobDescriptionClient, JobDescriptionInput } from './clients/job-description.client';
import { OfferLetterClient } from './clients/offer-letter.client';
import { OutreachEmailClient } from './clients/outreach-email.client';
import { FunnelNarrativeClient, FunnelNarrativeInput } from './clients/funnel-narrative.client';

@Injectable()
export class AiDraftingService {
  constructor(
    private readonly ai: AiInvocationService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobDescription: JobDescriptionClient,
    private readonly offerLetter: OfferLetterClient,
    private readonly outreachEmail: OutreachEmailClient,
    private readonly funnelNarrative: FunnelNarrativeClient,
  ) {}

  generateJobDescription(context: TenantContext, input: JobDescriptionInput): Promise<{ description: string }> {
    return this.ai.run(context, { source: 'job_description', sourceId: null }, (p) => this.jobDescription.generate(input, p));
  }

  async generateOfferLetter(
    context: TenantContext,
    entryId: string,
    input: { salary?: string; startDate?: string; notes?: string },
  ): Promise<{ body: string }> {
    const ctx = await this.resolveEntry(context, entryId);
    return this.ai.run(context, { source: 'offer_letter', sourceId: entryId }, (p) =>
      this.offerLetter.generate({ candidateName: ctx.candidateName, jobTitle: ctx.jobTitle, orgName: ctx.orgName, ...input }, p),
    );
  }

  async generateOutreachEmail(
    context: TenantContext,
    entryId: string,
    input: { intent: string; tone?: string },
  ): Promise<{ subject: string; body: string }> {
    const ctx = await this.resolveEntry(context, entryId);
    return this.ai.run(context, { source: 'outreach_email', sourceId: entryId }, (p) =>
      this.outreachEmail.generate({ candidateName: ctx.candidateName, jobTitle: ctx.jobTitle, candidateSummary: ctx.summary, ...input }, p),
    );
  }

  generateFunnelNarrative(context: TenantContext, input: FunnelNarrativeInput): Promise<{ narrative: string; highlights: string[] }> {
    return this.ai.run(context, { source: 'funnel_narrative', sourceId: null }, (p) => this.funnelNarrative.generate(input, p));
  }

  // Loads the candidate/job/org context an entry-scoped draft needs. candidate.name is not a
  // governed field; the résumé summary is only surfaced once parsing is done.
  private resolveEntry(context: TenantContext, entryId: string) {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      const [candidate, job, profile, org] = await Promise.all([
        tx.candidate.findFirst({ where: { id: entry.candidateId, organizationId: orgId } }),
        tx.job.findFirst({ where: { id: entry.jobId, organizationId: orgId } }),
        tx.candidateProfile.findFirst({ where: { candidateId: entry.candidateId, organizationId: orgId } }),
        tx.organization.findFirst({ where: { id: orgId } }),
      ]);
      return {
        candidateName: candidate?.name ?? 'the candidate',
        jobTitle: job?.title ?? 'the role',
        orgName: org?.name ?? null,
        summary: profile?.parseStatus === 'done' ? profile.parsedSummary : null,
      };
    });
  }
}
