import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { AiInvocationService } from './ai-invocation.service';
import { AiDraftingService } from './ai-drafting.service';
import { JobDescriptionClient } from './clients/job-description.client';
import { OfferLetterClient } from './clients/offer-letter.client';
import { OutreachEmailClient } from './clients/outreach-email.client';
import { FunnelNarrativeClient } from './clients/funnel-narrative.client';

describe('AiDraftingService', () => {
  let service: AiDraftingService;
  let tenantPrisma: { forTenant: jest.Mock };
  let ai: { run: jest.Mock };
  let jobDescription: { generate: jest.Mock };
  let offerLetter: { generate: jest.Mock };
  let outreachEmail: { generate: jest.Mock };
  let funnelNarrative: { generate: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const fakeProvider = { generateStructured: jest.fn(), ping: jest.fn() };

  function makeTx(over: Record<string, unknown> = {}) {
    return {
      pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', jobId: 'job-1', candidateId: 'cand-1', organizationId: 'org-1' }) },
      candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', name: 'Ada Lovelace' }) },
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Backend Engineer' }) },
      candidateProfile: { findFirst: jest.fn().mockResolvedValue({ parseStatus: 'done', parsedSummary: '5y Node' }) },
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme' }) },
      ...over,
    };
  }
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    tx = makeTx();
    tenantPrisma = { forTenant: jest.fn((_c, fn) => fn(tx)) };
    // ai.run just invokes fn(provider) so we can assert what each client receives.
    ai = { run: jest.fn((_ctx, _opts, fn) => fn(fakeProvider)) };
    jobDescription = { generate: jest.fn().mockResolvedValue({ description: 'JD' }) };
    offerLetter = { generate: jest.fn().mockResolvedValue({ body: 'offer' }) };
    outreachEmail = { generate: jest.fn().mockResolvedValue({ subject: 's', body: 'b' }) };
    funnelNarrative = { generate: jest.fn().mockResolvedValue({ narrative: 'n', highlights: [] }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AiDraftingService,
        { provide: AiInvocationService, useValue: ai },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: JobDescriptionClient, useValue: jobDescription },
        { provide: OfferLetterClient, useValue: offerLetter },
        { provide: OutreachEmailClient, useValue: outreachEmail },
        { provide: FunnelNarrativeClient, useValue: funnelNarrative },
      ],
    }).compile();
    service = moduleRef.get(AiDraftingService);
  });

  it('job description: runs under the job_description source and delegates to the client', async () => {
    const out = await service.generateJobDescription(context, { title: 'Backend Engineer', seniority: 'Senior' });
    expect(ai.run).toHaveBeenCalledWith(context, { source: 'job_description', sourceId: null }, expect.any(Function));
    expect(jobDescription.generate).toHaveBeenCalledWith({ title: 'Backend Engineer', seniority: 'Senior' }, fakeProvider);
    expect(out).toEqual({ description: 'JD' });
  });

  it('offer letter: resolves the entry and passes candidate/job/org context', async () => {
    await service.generateOfferLetter(context, 'entry-1', { salary: '$150k' });
    expect(ai.run).toHaveBeenCalledWith(context, { source: 'offer_letter', sourceId: 'entry-1' }, expect.any(Function));
    expect(offerLetter.generate).toHaveBeenCalledWith(
      { candidateName: 'Ada Lovelace', jobTitle: 'Backend Engineer', orgName: 'Acme', salary: '$150k' },
      fakeProvider,
    );
  });

  it('outreach email: includes the résumé summary only when parsing is done', async () => {
    await service.generateOutreachEmail(context, 'entry-1', { intent: 'invite to interview' });
    expect(outreachEmail.generate).toHaveBeenCalledWith(
      { candidateName: 'Ada Lovelace', jobTitle: 'Backend Engineer', candidateSummary: '5y Node', intent: 'invite to interview' },
      fakeProvider,
    );

    tx.candidateProfile.findFirst.mockResolvedValue({ parseStatus: 'pending', parsedSummary: 'ignored' });
    await service.generateOutreachEmail(context, 'entry-1', { intent: 'x' });
    expect(outreachEmail.generate).toHaveBeenLastCalledWith(expect.objectContaining({ candidateSummary: null }), fakeProvider);
  });

  it('throws NotFound when the entry is missing (offer + email)', async () => {
    tx.pipelineEntry.findFirst.mockResolvedValue(null);
    await expect(service.generateOfferLetter(context, 'nope', {})).rejects.toThrow(NotFoundException);
    await expect(service.generateOutreachEmail(context, 'nope', { intent: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('funnel narrative: runs under the funnel_narrative source', async () => {
    await service.generateFunnelNarrative(context, { stages: [{ name: 'Applied', count: 10 }] });
    expect(ai.run).toHaveBeenCalledWith(context, { source: 'funnel_narrative', sourceId: null }, expect.any(Function));
    expect(funnelNarrative.generate).toHaveBeenCalledWith({ stages: [{ name: 'Applied', count: 10 }] }, fakeProvider);
  });
});
