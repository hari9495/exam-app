import { AiQuestionGenerationProcessor } from './ai-question-generation.processor';

describe('AiQuestionGenerationProcessor', () => {
  let processor: AiQuestionGenerationProcessor;
  let claudeClient: { generate: jest.Mock };
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const input = { topic: 'JavaScript closures', difficulty: 'medium', questionTypes: ['single_mcq', 'true_false'], count: 2, requestedBy: 'user-1' };

  beforeEach(() => {
    claudeClient = { generate: jest.fn() };
    tenantPrisma = { forTenant: jest.fn() };
    processor = new AiQuestionGenerationProcessor(claudeClient as any, tenantPrisma as any);
  });

  it('inserts every valid generated question as a draft, ai-generated row', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'What does a closure capture?',
        options: [
          { text: 'Its enclosing scope', isCorrect: true },
          { text: 'Nothing', isCorrect: false },
        ],
      },
      {
        type: 'true_false',
        text: 'Closures are unique to JavaScript.',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValueOnce({ id: 'q-1' }).mockResolvedValueOnce({ id: 'q-2' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));

    const result = await processor.process(input, context);

    expect(result).toEqual({ requested: 2, created: 2, dropped: [], questionIds: ['q-1', 'q-2'] });
    expect(create).toHaveBeenNthCalledWith(1, {
      data: {
        organizationId: 'org-1',
        type: 'single_mcq',
        text: 'What does a closure capture?',
        topic: 'JavaScript closures',
        difficulty: 'medium',
        marks: 1,
        negativeMarks: 0,
        status: 'draft',
        aiGenerated: true,
        createdBy: 'user-1',
        options: {
          create: [
            { text: 'Its enclosing scope', isCorrect: true, orderIndex: 0 },
            { text: 'Nothing', isCorrect: false, orderIndex: 1 },
          ],
        },
      },
    });
  });

  it('drops questions that fail validation and still completes with the valid ones', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Valid question',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
      {
        type: 'single_mcq',
        text: 'Invalid: two correct answers',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValue({ id: 'q-1' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));

    const result = await processor.process(input, context);

    expect(result.created).toBe(1);
    expect(result.dropped).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('completes with zero created questions when every generated question fails validation', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Invalid',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      },
    ]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create: jest.fn() } }));

    const result = await processor.process(input, context);

    expect(result).toEqual({ requested: 2, created: 0, dropped: [{ reason: expect.any(String) }], questionIds: [] });
  });

  it('truncates generated questions to the requested count before validating and inserting', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Question 1',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
      {
        type: 'single_mcq',
        text: 'Question 2',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
      {
        type: 'single_mcq',
        text: 'Question 3 (should be truncated)',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValueOnce({ id: 'q-1' }).mockResolvedValueOnce({ id: 'q-2' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));

    const result = await processor.process(input, context);

    expect(result.created).toBe(2);
    expect(result.questionIds).toEqual(['q-1', 'q-2']);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('drops a generated question whose type is not in the requested questionTypes, without inserting it', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Requested type',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
      {
        type: 'multi_mcq',
        text: 'Not requested type',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValueOnce({ id: 'q-1' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));

    const result = await processor.process(input, context);

    expect(result.created).toBe(1);
    expect(result.questionIds).toEqual(['q-1']);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.dropped).toEqual([
      { reason: 'Generated type "multi_mcq" was not in the requested questionTypes' },
    ]);
  });

  it('propagates an error thrown by the Claude client, failing the whole job with zero inserts', async () => {
    claudeClient.generate.mockRejectedValue(new Error('rate limited'));

    await expect(processor.process(input, context)).rejects.toThrow('rate limited');
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });
});
