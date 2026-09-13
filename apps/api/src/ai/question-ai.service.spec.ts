import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { AiInvocationService } from './ai-invocation.service';
import { QuestionAiService } from './question-ai.service';
import { QuestionTagsClient } from './clients/question-tags.client';
import { QuestionDistractorsClient } from './clients/question-distractors.client';

describe('QuestionAiService', () => {
  let service: QuestionAiService;
  let ai: { run: jest.Mock };
  let tenantPrisma: { forTenant: jest.Mock };
  let tagsClient: { generate: jest.Mock };
  let distractorsClient: { generate: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const provider = { generateStructured: jest.fn(), ping: jest.fn() };

  beforeEach(async () => {
    ai = { run: jest.fn((_ctx, _opts, fn) => fn(provider)) };
    tenantPrisma = { forTenant: jest.fn((_c, fn) => fn({ tag: { findMany: jest.fn().mockResolvedValue([{ id: 't1', name: 'Algorithms' }, { id: 't2', name: 'SQL' }]) } })) };
    tagsClient = { generate: jest.fn() };
    distractorsClient = { generate: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionAiService,
        { provide: AiInvocationService, useValue: ai },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: QuestionTagsClient, useValue: tagsClient },
        { provide: QuestionDistractorsClient, useValue: distractorsClient },
      ],
    }).compile();
    service = moduleRef.get(QuestionAiService);
  });

  describe('suggestTags', () => {
    it('rejects empty text', async () => {
      await expect(service.suggestTags(context, { text: '  ' })).rejects.toThrow(BadRequestException);
    });

    it('maps matched names (case-insensitive) to org tag ids and keeps only genuinely-new suggestions', async () => {
      tagsClient.generate.mockResolvedValue({ matched: ['algorithms', 'Nonexistent'], suggested: ['Graphs', 'sql'] });
      const out = await service.suggestTags(context, { text: 'What is a binary search?' });

      expect(ai.run).toHaveBeenCalledWith(context, { source: 'question_tags', sourceId: null }, expect.any(Function));
      // 'algorithms' -> t1 (case-insensitive); 'Nonexistent' isn't a real tag so it's dropped from existing
      expect(out.existing).toEqual([{ tagId: 't1', name: 'Algorithms' }]);
      // 'Graphs' is new; 'sql' already exists (as SQL) so it's dropped from suggestions
      expect(out.suggested).toEqual(['Graphs']);
    });
  });

  describe('generateDistractors', () => {
    it('rejects empty stem or no correct answers', async () => {
      await expect(service.generateDistractors(context, { stem: '', correctAnswers: ['x'] })).rejects.toThrow(BadRequestException);
      await expect(service.generateDistractors(context, { stem: 'Q', correctAnswers: [] })).rejects.toThrow(BadRequestException);
    });

    it('clamps the count and delegates to the client under the question_distractors source', async () => {
      distractorsClient.generate.mockResolvedValue({ distractors: ['a', 'b'] });
      const out = await service.generateDistractors(context, { stem: '2+2?', correctAnswers: ['4'], count: 999 });
      expect(ai.run).toHaveBeenCalledWith(context, { source: 'question_distractors', sourceId: null }, expect.any(Function));
      expect(distractorsClient.generate).toHaveBeenCalledWith({ stem: '2+2?', correctAnswers: ['4'], count: 8 }, provider);
      expect(out).toEqual({ distractors: ['a', 'b'] });
    });
  });
});
