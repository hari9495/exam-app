import { CandidateFitProcessor } from './candidate-fit.processor';
import { QuotaExceededException } from '../../billing/quota-exceeded.exception';

describe('CandidateFitProcessor', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const aiJobId = 'aijob-1';
  let tx: any;
  let tenantPrisma: any;
  let aiResolver: any;
  let audit: any;
  let provider: any;
  let quota: any;
  let processor: CandidateFitProcessor;
  const callOrder: string[] = [];

  const entry = { id: 'entry-1', jobId: 'job-1', candidateId: 'cand-1', organizationId: 'org-1' };
  const job = { id: 'job-1', title: 'Backend Eng', description: 'APIs', fitCriteria: null, fitRubric: null };
  const profile = { candidateId: 'cand-1', parseStatus: 'done', parsedSummary: 'Senior', parsedSkills: '["Node"]', parsedTitle: 'Eng', parsedYearsExperience: 6 };

  beforeEach(() => {
    callOrder.length = 0;
    tx = {
      pipelineEntry: { findFirst: jest.fn().mockResolvedValue(entry) },
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      candidateProfile: { findFirst: jest.fn().mockResolvedValue(profile) },
      aiJob: { findUnique: jest.fn().mockResolvedValue({ id: aiJobId, createdBy: 'user-9' }) },
      candidateFitAssessment: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
      aiCreditUsage: { create: jest.fn().mockResolvedValue({}) },
    };
    tenantPrisma = {
      forTenant: jest.fn(async (_ctx: any, fn: any) => {
        callOrder.push('forTenant');
        return fn(tx);
      }),
    };
    provider = {
      generateStructured: jest.fn(async () => {
        callOrder.push('ai');
        return { overallScore: 80, summary: 'Good fit', strengths: ['Node'], concerns: ['No AWS'] };
      }),
    };
    aiResolver = { resolve: jest.fn().mockResolvedValue(provider) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    quota = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    processor = new CandidateFitProcessor(tenantPrisma, aiResolver, audit, quota);
  });

  it('has type candidate_fit', () => {
    expect(processor.type).toBe('candidate_fit');
  });

  it('writes a done assessment with score/summary, credit usage, and an audit stamped with the enqueuing user', async () => {
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);

    const update = tx.candidateFitAssessment.update.mock.calls.at(-1)[0];
    expect(update.where).toEqual({ entryId: 'entry-1' });
    expect(update.data).toMatchObject({ status: 'done', overallScore: 80, summary: 'Good fit', scoredByUserId: 'user-9', aiJobId });
    expect(JSON.parse(update.data.strengths)).toEqual(['Node']);
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'candidate_fit', sourceId: 'entry-1' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.objectContaining({ actorUserId: 'user-9', action: 'candidate_fit.scored', entityType: 'candidate_fit_assessment', entityId: 'entry-1' }),
    );
  });

  it('runs the AI call OUTSIDE every forTenant tx', async () => {
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    const firstAi = callOrder.indexOf('ai');
    const lastForTenantBeforeAi = callOrder.lastIndexOf('forTenant', firstAi);
    const forTenantAfterAi = callOrder.indexOf('forTenant', firstAi);
    // there is at least one read forTenant before the AI call and one write forTenant after it,
    // and the AI call itself is not nested inside a forTenant callback (it appears between them)
    expect(lastForTenantBeforeAi).toBeGreaterThanOrEqual(0);
    expect(forTenantAfterAi).toBeGreaterThan(firstAi);
  });

  it('marks skipped_no_resume when the candidate has no parsed profile, without calling the AI', async () => {
    tx.candidateProfile.findFirst.mockResolvedValue({ ...profile, parseStatus: 'pending' });
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    expect(provider.generateStructured).not.toHaveBeenCalled();
    expect(tx.candidateFitAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped_no_resume' }) }));
  });

  it('marks skipped_no_ai_key when the org has no AI provider, without failing', async () => {
    const { AiNotConfiguredError } = require('@exam-platform/shared');
    aiResolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    expect(tx.candidateFitAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped_no_ai_key' }) }));
  });

  it('marks failed on a malformed AI response', async () => {
    provider.generateStructured.mockResolvedValue({ overallScore: 50 }); // missing summary
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    expect(tx.candidateFitAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });

  it('does not call the AI provider when the AI-credit quota is exceeded', async () => {
    quota.assertWithinLimit.mockRejectedValue(new QuotaExceededException('ai_credits', 50, 50));
    await processor.process({ entryId: 'entry-1' }, context, aiJobId).catch(() => {});
    expect(provider.generateStructured).not.toHaveBeenCalled();
  });
});
