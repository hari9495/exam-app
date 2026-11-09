import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { InterviewAiService } from './interview-ai.service';
import { InterviewQuestionsClient } from './interview-questions.client';

describe('InterviewAiService', () => {
  let service: InterviewAiService;
  let tenantPrisma: { forTenant: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let quota: { assertWithinLimit: jest.Mock };
  let questionsClient: { generate: jest.Mock };

  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const fakeProvider = { generateStructured: jest.fn(), ping: jest.fn() };

  // A tx double covering every table the service touches; findFirst results are seeded per-test.
  function makeTx(over: Record<string, unknown> = {}) {
    return {
      pipelineEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', jobId: 'job-1', candidateId: 'cand-1', organizationId: 'org-1' }) },
      job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1', title: 'Backend Engineer', description: 'Build APIs', fitCriteria: 'Owns delivery' }) },
      candidateProfile: { findFirst: jest.fn().mockResolvedValue({ parseStatus: 'done', parsedSummary: '5y Node.js' }) },
      interview: { findFirst: jest.fn().mockResolvedValue({ id: 'int-1', pipelineEntryId: 'entry-1', organizationId: 'org-1' }) },
      aiCreditUsage: { create: jest.fn().mockResolvedValue({}) },
      ...over,
    };
  }
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    tx = makeTx();
    tenantPrisma = { forTenant: jest.fn((_ctx, fn) => fn(tx)) };
    resolver = { resolve: jest.fn().mockResolvedValue(fakeProvider) };
    quota = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    questionsClient = { generate: jest.fn().mockResolvedValue([{ question: 'Q1', category: 'technical', rationale: 'why' }]) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InterviewAiService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AiApiKeyResolverService, useValue: resolver },
        { provide: QuotaService, useValue: quota },
        { provide: InterviewQuestionsClient, useValue: questionsClient },
      ],
    }).compile();
    service = moduleRef.get(InterviewAiService);
  });

  describe('generateQuestions', () => {
    it('resolves job + candidate summary, enforces quota, records usage, and returns questions', async () => {
      const result = await service.generateQuestions(context, 'entry-1', { count: 5, focus: 'system design' });

      expect(quota.assertWithinLimit).toHaveBeenCalledWith(context, 'ai_credits');
      expect(questionsClient.generate).toHaveBeenCalledWith(
        { title: 'Backend Engineer', description: 'Build APIs', fitCriteria: 'Owns delivery', candidateSummary: '5y Node.js', focus: 'system design' },
        5,
        fakeProvider,
      );
      expect(tx.aiCreditUsage.create).toHaveBeenCalledWith({ data: { organizationId: 'org-1', source: 'interview_questions', credits: 1, sourceId: 'entry-1' } });
      expect(result.questions).toHaveLength(1);
    });

    it('omits the candidate summary when the résumé is not parsed', async () => {
      tx.candidateProfile.findFirst.mockResolvedValue({ parseStatus: 'pending', parsedSummary: 'ignored' });
      await service.generateQuestions(context, 'entry-1', {});
      expect(questionsClient.generate).toHaveBeenCalledWith(
        expect.objectContaining({ candidateSummary: null }),
        8, // default count
        fakeProvider,
      );
    });

    it('clamps an over-large count to the max', async () => {
      await service.generateQuestions(context, 'entry-1', { count: 999 });
      expect(questionsClient.generate).toHaveBeenCalledWith(expect.anything(), 15, fakeProvider);
    });

    it('throws NotFound when the entry is missing', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);
      await expect(service.generateQuestions(context, 'nope', {})).rejects.toThrow(NotFoundException);
      expect(quota.assertWithinLimit).not.toHaveBeenCalled();
    });

    it('maps AiNotConfiguredError to a BadRequest and does not charge or call the model', async () => {
      resolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));
      await expect(service.generateQuestions(context, 'entry-1', {})).rejects.toThrow(BadRequestException);
      expect(quota.assertWithinLimit).not.toHaveBeenCalled();
      expect(questionsClient.generate).not.toHaveBeenCalled();
    });
  });
});
