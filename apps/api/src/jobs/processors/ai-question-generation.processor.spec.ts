import { AiQuestionGenerationProcessor } from './ai-question-generation.processor';

describe('AiQuestionGenerationProcessor', () => {
  let processor: AiQuestionGenerationProcessor;
  let questionGenerationClient: { generate: jest.Mock };
  let tenantPrisma: { forTenant: jest.Mock };
  let aiApiKeyResolver: { resolve: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const input = {
    topic: 'JavaScript closures',
    difficulty: 'medium',
    questionTypes: ['single_mcq', 'true_false'],
    count: 2,
    marks: 1,
    negativeMarks: 0,
    tagIds: [],
    requestedBy: 'user-1',
  };
  const aiProvider = { generateStructured: jest.fn(), ping: jest.fn() };

  beforeEach(() => {
    questionGenerationClient = { generate: jest.fn() };
    tenantPrisma = { forTenant: jest.fn() };
    aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue(aiProvider) };
    processor = new AiQuestionGenerationProcessor(questionGenerationClient as any, tenantPrisma as any, aiApiKeyResolver as any);
  });

  it('inserts every valid generated question as a draft, ai-generated row', async () => {
    questionGenerationClient.generate.mockResolvedValue([
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
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }));

    const result = await processor.process(input, context, 'job-1');

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
        aiJobId: 'job-1',
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

  it('records AiCreditUsage with credits equal to the number of questions actually created', async () => {
    questionGenerationClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Valid question',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValueOnce({ id: 'q-1' });
    const aiCreditUsageCreate = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ question: { create }, aiCreditUsage: { create: aiCreditUsageCreate } }),
    );

    await processor.process(input, context, 'job-1');

    expect(aiCreditUsageCreate).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', source: 'question_generation', credits: 1, sourceId: 'job-1' },
    });
  });

  it('does not record AiCreditUsage when zero questions are created', async () => {
    questionGenerationClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Invalid',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      },
    ]);
    const aiCreditUsageCreate = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ question: { create: jest.fn() }, aiCreditUsage: { create: aiCreditUsageCreate } }),
    );

    await processor.process(input, context, 'job-1');

    expect(aiCreditUsageCreate).not.toHaveBeenCalled();
  });

  it('drops questions that fail validation and still completes with the valid ones', async () => {
    questionGenerationClient.generate.mockResolvedValue([
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
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }));

    const result = await processor.process(input, context, 'job-1');

    expect(result.created).toBe(1);
    expect(result.dropped).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('completes with zero created questions when every generated question fails validation', async () => {
    questionGenerationClient.generate.mockResolvedValue([
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

    const result = await processor.process(input, context, 'job-1');

    expect(result).toEqual({ requested: 2, created: 0, dropped: [{ reason: expect.any(String) }], questionIds: [] });
  });

  it('truncates generated questions to the requested count before validating and inserting', async () => {
    questionGenerationClient.generate.mockResolvedValue([
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
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }));

    const result = await processor.process(input, context, 'job-1');

    expect(result.created).toBe(2);
    expect(result.questionIds).toEqual(['q-1', 'q-2']);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('drops a generated question whose type is not in the requested questionTypes, without inserting it', async () => {
    questionGenerationClient.generate.mockResolvedValue([
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
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }));

    const result = await processor.process(input, context, 'job-1');

    expect(result.created).toBe(1);
    expect(result.questionIds).toEqual(['q-1']);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.dropped).toEqual([
      { reason: 'Generated type "multi_mcq" was not in the requested questionTypes' },
    ]);
  });

  it('gives the write transaction a budget larger than Prisma defaults, so an expiry cannot bin a paid batch', async () => {
    questionGenerationClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'What does a closure capture?',
        options: [
          { text: 'Its enclosing scope', isCorrect: true },
          { text: 'Nothing', isCorrect: false },
        ],
      },
    ]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ question: { create: jest.fn().mockResolvedValue({ id: 'q-1' }) }, aiCreditUsage: { create: jest.fn() } }),
    );

    await processor.process(input, context, 'job-1');

    // Asserted against Prisma's own defaults rather than the literals, so this fails if the
    // options are dropped OR if they are set to something that isn't actually an increase.
    const options = tenantPrisma.forTenant.mock.calls[0][2];
    expect(options.timeout).toBeGreaterThan(5000);
    expect(options.maxWait).toBeGreaterThan(2000);
  });

  it('propagates an error thrown by the Claude client, failing the whole job with zero inserts', async () => {
    questionGenerationClient.generate.mockRejectedValue(new Error('rate limited'));

    await expect(processor.process(input, context, 'job-1')).rejects.toThrow('rate limited');
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('applies the requested marks, negative marks and tags to every generated question', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const creditCreate = jest.fn().mockResolvedValue({});
    const tagFindMany = jest.fn().mockResolvedValue([{ id: 'tag-1' }]);
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: creditCreate }, tag: { findMany: tagFindMany } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 5, negativeMarks: 2, tagIds: ['tag-1'], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    );

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.marks).toBe(5);
    expect(data.negativeMarks).toBe(2);
    expect(data.tags).toEqual({ create: [{ tagId: 'tag-1' }] });
  });

  it('dedupes duplicate tagIds so a repeated id does not violate the question_tags composite primary key', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const tagFindMany = jest.fn().mockResolvedValue([{ id: 'tag-1' }]);
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: jest.fn() }, tag: { findMany: tagFindMany } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 1, negativeMarks: 0, tagIds: ['tag-1', 'tag-1'], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    );

    expect(tagFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['tag-1'] }, organizationId: 'org-1' },
      select: { id: true },
    });
    const data = create.mock.calls[0][0].data;
    expect(data.tags).toEqual({ create: [{ tagId: 'tag-1' }] });
  });

  it('resolves tagIds scoped to the caller organization and silently drops ids that are stale or belong to another org', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    // only tag-1 comes back: tag-2 either does not exist or belongs to a different organization
    const tagFindMany = jest.fn().mockResolvedValue([{ id: 'tag-1' }]);
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: jest.fn() }, tag: { findMany: tagFindMany } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    const result = await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 1, negativeMarks: 0, tagIds: ['tag-1', 'tag-2'], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    );

    expect(tagFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['tag-1', 'tag-2'] }, organizationId: 'org-1' },
      select: { id: true },
    });
    const data = create.mock.calls[0][0].data;
    expect(data.tags).toEqual({ create: [{ tagId: 'tag-1' }] });
    expect(result.created).toBe(1);
  });

  it('still processes an old-shaped persisted job input that predates marks/negativeMarks/tagIds without throwing', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const creditCreate = jest.fn().mockResolvedValue({});
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: creditCreate } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    // old-shaped input: no marks, no negativeMarks, no tagIds
    const oldShapedInput = { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, requestedBy: 'user-1' };

    const result = await processor.process(
      oldShapedInput,
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    );

    expect(result.created).toBe(1);
    const data = create.mock.calls[0][0].data;
    expect(data.marks).toBe(1);
    expect(data.negativeMarks).toBe(0);
    expect(data.tags).toBeUndefined();
  });

  it('stamps the job id on each question and on the credit usage row, so a charge can be traced back', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const creditCreate = jest.fn().mockResolvedValue({});
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: creditCreate } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 1, negativeMarks: 0, tagIds: [], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-42',
    );

    expect(create.mock.calls[0][0].data.aiJobId).toBe('job-42');
    expect(creditCreate.mock.calls[0][0].data.sourceId).toBe('job-42');
  });

  it('validates against the requested marks, not a hardcoded 1', async () => {
    // negativeMarks greater than marks is invalid; if the processor validated against a
    // hardcoded marks:1 it would wrongly accept this and write an unusable question.
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    const result = await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 1, negativeMarks: 99, tagIds: [], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    ) as { created: number; dropped: { reason: string }[] };

    expect(result.created).toBe(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('negativeMarks cannot exceed marks');
  });
});
