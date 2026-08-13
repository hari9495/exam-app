import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { TenantPrismaService, BlobStorageService, AiApiKeyResolverService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';
import { AuditService } from '@exam-platform/shared';

// Direct-construction helper for tests that only care about aiGenerate's collaborators. Bypasses
// Nest's (async) DI container so call sites can stay synchronous, and lets each test override just
// the collaborator it's exercising instead of restating the whole provider list.
function buildService(overrides: {
  tenantPrisma?: Partial<{ forTenant: jest.Mock }>;
  jobsService?: Partial<{ enqueue: jest.Mock }>;
  examRuntime?: Partial<{ listAvailableLanguages: jest.Mock }>;
  audit?: Partial<{ record: jest.Mock }>;
  blobStorage?: Partial<{ upload: jest.Mock; uploadDataUri: jest.Mock; signIfOurs: jest.Mock }>;
  aiApiKeyResolver?: Partial<{ resolve: jest.Mock }>;
} = {}): QuestionsService {
  const tenantPrisma = { forTenant: jest.fn(), ...overrides.tenantPrisma };
  const jobsService = { enqueue: jest.fn(), ...overrides.jobsService };
  const examRuntime = { listAvailableLanguages: jest.fn(), ...overrides.examRuntime };
  const audit = { record: jest.fn(), ...overrides.audit };
  const blobStorage = { upload: jest.fn(), uploadDataUri: jest.fn(), signIfOurs: jest.fn((v: unknown) => Promise.resolve(v)), ...overrides.blobStorage };
  const aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue({ name: 'anthropic' }), ...overrides.aiApiKeyResolver };
  return new QuestionsService(
    tenantPrisma as unknown as TenantPrismaService,
    jobsService as unknown as JobsService,
    examRuntime as unknown as ExamRuntimeInternalClient,
    blobStorage as unknown as BlobStorageService,
    audit as unknown as AuditService,
    aiApiKeyResolver as unknown as AiApiKeyResolverService,
  );
}

describe('QuestionsService', () => {
  let service: QuestionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let jobsService: { enqueue: jest.Mock };
  let examRuntime: { listAvailableLanguages: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    jobsService = { enqueue: jest.fn() };
    examRuntime = { listAvailableLanguages: jest.fn().mockResolvedValue({ languages: [{ language: 'javascript', version: '18.15.0' }, { language: 'python', version: '3.10.0' }] }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: JobsService, useValue: jobsService },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: BlobStorageService, useValue: { upload: jest.fn(), uploadDataUri: jest.fn(), signIfOurs: jest.fn((v) => Promise.resolve(v)) } },
        { provide: AiApiKeyResolverService, useValue: { resolve: jest.fn().mockResolvedValue({ name: 'anthropic' }) } },
      ],
    }).compile();
    service = moduleRef.get(QuestionsService);
  });

  const validDto = {
    type: 'single_mcq',
    text: 'What is 2+2?',
    difficulty: 'easy',
    marks: 5,
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true },
    ],
  };

  it('creates a question scoped to the caller\'s organization', async () => {
    const created = { id: 'q-1', organizationId: 'org-1', ...validDto, options: validDto.options, tags: [] };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ tag: { upsert: jest.fn() }, question: { create: jest.fn().mockResolvedValue(created) } }),
    );

    const result = await service.create(context, 'user-1', validDto);

    // toResponse now normalizes image URLs (null when absent) after SAS-signing them on read,
    // and parses allowedLanguages (JSON string in the DB) into the string[] the client expects.
    expect(result).toEqual({
      ...created,
      imageUrl: null,
      allowedLanguages: [],
      options: created.options.map((option) => ({ ...option, imageUrl: null })),
    });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('rejects an invalid payload before touching the database', async () => {
    const invalidDto = { ...validDto, options: [{ text: '4', isCorrect: false }, { text: '3', isCorrect: false }] };

    await expect(service.create(context, 'user-1', invalidDto)).rejects.toThrow(BadRequestException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('creates a fixed-mode code question with one language and persists languageMode/allowedLanguages/starterCode', async () => {
    const codeDto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      languageMode: 'fixed',
      allowedLanguages: ['javascript'],
      starterCode: 'function reverse(str) {\n  \n}',
      options: [],
    };
    const created = { id: 'q-1', organizationId: 'org-1', ...codeDto, allowedLanguages: JSON.stringify(['javascript']), tags: [] };
    const questionCreate = jest.fn().mockResolvedValue(created);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    const result = await service.create(context, 'user-1', codeDto);

    expect(result.type).toBe('code');
    expect(result.options).toEqual([]);
    // The DB stores allowedLanguages as a JSON string; the response must hand back a string[] so the
    // client's `allowedLanguages.join(', ')` doesn't throw and crash the question-bank list.
    expect(result.allowedLanguages).toEqual(['javascript']);
    expect(examRuntime.listAvailableLanguages).toHaveBeenCalled();
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          languageMode: 'fixed',
          allowedLanguages: JSON.stringify(['javascript']),
          starterCode: 'function reverse(str) {\n  \n}',
        }),
      }),
    );
  });

  it('creates an any-mode code question without fetching languages for validation of allowedLanguages, but still stores languageMode', async () => {
    const codeDto = {
      type: 'code',
      text: 'Solve this in any language.',
      difficulty: 'hard',
      marks: 15,
      languageMode: 'any',
      options: [],
    };
    const created = { id: 'q-2', organizationId: 'org-1', ...codeDto, allowedLanguages: null, tags: [] };
    const questionCreate = jest.fn().mockResolvedValue(created);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    const result = await service.create(context, 'user-1', codeDto);

    expect(result.type).toBe('code');
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ languageMode: 'any', allowedLanguages: null }) }),
    );
  });

  it('rejects creating a fixed-mode code question with a language the live Piston list does not have', async () => {
    const codeDto = {
      type: 'code',
      text: 'x',
      difficulty: 'easy',
      marks: 5,
      languageMode: 'fixed',
      allowedLanguages: ['cobol'],
      options: [],
    };

    await expect(service.create(context, 'user-1', codeDto)).rejects.toThrow(BadRequestException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('persists snippetCode/snippetLanguage/imageUrl and per-option imageUrl for a single_mcq question', async () => {
    const dto = {
      type: 'single_mcq',
      text: 'What does this code print?',
      difficulty: 'easy',
      marks: 5,
      snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])',
      snippetLanguage: 'python',
      imageUrl: 'question-images/stem.png',
      options: [
        { text: '[3, 2, 1]', isCorrect: true, imageUrl: 'question-images/opt-a.png' },
        { text: '[1, 2, 3]', isCorrect: false },
      ],
    };
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', organizationId: 'org-1', ...dto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', dto);

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])',
          snippetLanguage: 'python',
          imageUrl: 'question-images/stem.png',
          options: {
            create: [
              { text: '[3, 2, 1]', isCorrect: true, orderIndex: 0, imageUrl: 'question-images/opt-a.png' },
              // null rather than undefined: toStoredImageUrl normalises "no image" so the column
              // is written explicitly. Both land as NULL on a create, so nothing changes on disk.
              { text: '[1, 2, 3]', isCorrect: false, orderIndex: 1, imageUrl: null },
            ],
          },
        }),
      }),
    );
  });

  it('stores the bare blob URL when the edit form posts back a SAS-signed one', async () => {
    // Reads sign image URLs, and the edit form returns whatever it was given. Persisting that
    // verbatim baked a ~20-minute token into image_url, so editing a question's text silently
    // killed its picture 20 minutes later -- unrecoverable, since a URL that already carries a
    // token cannot be re-signed.
    const signed = 'https://a.blob.core.windows.net/c/question-images/stem.png?sv=2026-06-06&se=2026-08-07T20%3A01%3A07Z&sig=abc%3D';
    const dto = {
      text: 'Q', type: 'single_mcq', difficulty: 'easy', marks: 1,
      imageUrl: signed,
      options: [
        { text: 'a', isCorrect: true, imageUrl: signed },
        { text: 'b', isCorrect: false },
      ],
    } as any;
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', organizationId: 'org-1', ...dto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({ question: { create: questionCreate }, tag: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() } }));

    await service.create(context, 'user-1', dto);

    const bare = 'https://a.blob.core.windows.net/c/question-images/stem.png';
    const data = questionCreate.mock.calls[0][0].data;
    expect(data.imageUrl).toBe(bare);
    expect(data.options.create[0].imageUrl).toBe(bare);
  });

  it('does not persist snippetCode/snippetLanguage/imageUrl for a code question even if sent', async () => {
    const dto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      languageMode: 'fixed',
      allowedLanguages: ['javascript'],
      starterCode: 'function reverse(str) {}',
      snippetCode: 'this should be ignored',
      snippetLanguage: 'python',
      imageUrl: 'question-images/should-be-ignored.png',
      options: [],
    };
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', organizationId: 'org-1', ...dto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', dto);

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snippetCode: null, snippetLanguage: null, imageUrl: null }),
      }),
    );
  });

  it('passes allowStdin through to the created question', async () => {
    const created = { id: 'q-1', organizationId: 'org-1', ...validDto, allowStdin: true, options: validDto.options, tags: [] };
    const tx = { tag: { upsert: jest.fn() }, question: { create: jest.fn().mockResolvedValue(created) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { ...validDto, allowStdin: true });

    expect(tx.question.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowStdin: true }) }),
    );
  });

  it('resolves tag names into Tag rows and links them when creating a question, deduping and trimming input', async () => {
    const tagUpsert = jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `tag-${create.name}`, ...create }));
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', ...validDto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: tagUpsert }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', { ...validDto, tags: ['javascript', 'javascript', ' typescript '] });

    expect(tagUpsert).toHaveBeenCalledTimes(2);
    expect(tagUpsert).toHaveBeenCalledWith({
      where: { organizationId_name: { organizationId: 'org-1', name: 'javascript' } },
      create: { organizationId: 'org-1', name: 'javascript' },
      update: {},
    });
    expect(tagUpsert).toHaveBeenCalledWith({
      where: { organizationId_name: { organizationId: 'org-1', name: 'typescript' } },
      create: { organizationId: 'org-1', name: 'typescript' },
      update: {},
    });
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tags: { create: [{ tagId: 'tag-javascript' }, { tagId: 'tag-typescript' }] } }),
      }),
    );
  });

  it('dedupes tag ids resolved from case-insensitive-collation duplicate tag names, avoiding a PK violation', async () => {
    // Simulates the real SQL_Latin1_General_CP1_CI_AS collation on tags.name: upserting 'React' and 'react'
    // both resolve to the same underlying row, so the mock always returns the same id regardless of casing.
    const tagUpsert = jest.fn().mockImplementation(({ create }) =>
      Promise.resolve({ id: `tag-${create.name.toLowerCase()}`, ...create }),
    );
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', ...validDto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: tagUpsert }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', { ...validDto, tags: ['React', 'react'] });

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tags: { create: [{ tagId: 'tag-react' }] } }),
      }),
    );
  });

  it('lists questions scoped to the caller\'s organization, defaulting to active status', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({
        question: {
          findMany: jest.fn().mockResolvedValue([{ id: 'q-1', status: 'active', tags: [] }]),
          count: jest.fn().mockResolvedValue(1),
        },
      }),
    );

    const result = await service.list(context, {});

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('filters the list by tagId when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findMany, count } }));

    await service.list(context, { tagId: 'tag-1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tags: { some: { tagId: 'tag-1' } } }) }),
    );
  });

  it('paginates and filters by search on question text', async () => {
    const tx = {
      question: {
        findMany: jest.fn().mockResolvedValue([{ id: 'q-2', text: 'Reverse a linked list', options: [], tags: [] }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, { page: '1', pageSize: '10', search: 'linked list' });

    expect(tx.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ text: { contains: 'linked list' } }),
        skip: 0,
        take: 10,
      }),
    );
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('throws NotFoundException when findOne cannot find the question', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findFirst: jest.fn().mockResolvedValue(null) } }));

    await expect(service.findOne(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('returns a question with its tags flattened to {id, name} when findOne succeeds', async () => {
    const found = { id: 'q-1', tags: [{ tagId: 'tag-1', questionId: 'q-1', tag: { id: 'tag-1', name: 'javascript' } }] };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findFirst: jest.fn().mockResolvedValue(found) } }));

    const result = await service.findOne(context, 'q-1');

    expect(result.tags).toEqual([{ id: 'tag-1', name: 'javascript' }]);
  });

  it('replaces a question\'s tags entirely on update, not merging with the prior set', async () => {
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', ...validDto, tags: [] }),
      },
      questionOption: { deleteMany: jest.fn() },
      questionTag: { deleteMany: jest.fn() },
      tag: { upsert: jest.fn().mockResolvedValue({ id: 'tag-new' }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'q-1', { ...validDto, tags: ['new-tag'] });

    expect(tx.questionTag.deleteMany).toHaveBeenCalledWith({ where: { questionId: 'q-1' } });
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: { create: [{ tagId: 'tag-new' }] } }) }),
    );
  });

  it('does not persist snippetCode/snippetLanguage/imageUrl for a code question even if sent, on update', async () => {
    const dto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      languageMode: 'fixed',
      allowedLanguages: ['javascript'],
      starterCode: 'function reverse(str) {}',
      snippetCode: 'this should be ignored',
      snippetLanguage: 'python',
      imageUrl: 'question-images/should-be-ignored.png',
      options: [],
    };
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', ...dto, tags: [] }),
      },
      questionOption: { deleteMany: jest.fn() },
      questionTag: { deleteMany: jest.fn() },
      tag: { upsert: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'q-1', dto);

    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snippetCode: null, snippetLanguage: null, imageUrl: null }),
      }),
    );
  });

  it('clears a stale starterCode on update when the dto omits it (e.g. languageMode widened past single-fixed)', async () => {
    const dto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      languageMode: 'any',
      // starterCode intentionally omitted, mirroring the frontend's submission when a
      // code question's language mode widens past single-fixed-language.
      options: [],
    };
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1', starterCode: 'function reverse(str) {\n  \n}' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', ...dto, starterCode: null, tags: [] }),
      },
      questionOption: { deleteMany: jest.fn() },
      questionTag: { deleteMany: jest.fn() },
      tag: { upsert: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'q-1', dto);

    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ starterCode: null }) }),
    );
  });

  it('archives a question by setting status to archived', async () => {
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', status: 'archived', tags: [] }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.archive(context, 'user-1', 'q-1');

    expect(result.status).toBe('archived');
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      data: { status: 'archived' },
      include: { options: true, tags: { include: { tag: true } } },
    });
  });

  it('throws NotFoundException when archiving a question that does not exist', async () => {
    const tx = { question: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.archive(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
  });

  describe('aiGenerate', () => {
    it('enqueues an ai-question-generation job with the request fields plus the requesting user', async () => {
      jobsService.enqueue.mockResolvedValue({ id: 'job-1' });

      const result = await service.aiGenerate(context, 'user-1', {
        topic: 'React hooks',
        difficulty: 'medium',
        questionTypes: ['single_mcq'],
        count: 5,
        marks: 2,
        negativeMarks: 0,
        tagIds: [],
      } as never);

      expect(result).toEqual({ aiJobId: 'job-1' });
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        context,
        'ai-question-generation',
        JSON.stringify({
          topic: 'React hooks',
          difficulty: 'medium',
          questionTypes: ['single_mcq'],
          count: 5,
          marks: 2,
          negativeMarks: 0,
          tagIds: [],
          requestedBy: 'user-1',
        }),
        'user-1',
      );
    });

    it('passes marks, negative marks and tags through to the generation job', async () => {
      const enqueue = jest.fn().mockResolvedValue({ id: 'job-9' });
      const service = buildService({ jobsService: { enqueue } });

      const result = await service.aiGenerate(
        { organizationId: 'org-1', isSuperAdmin: false } as never,
        'user-1',
        { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 4, negativeMarks: 1, tagIds: ['t1'] } as never,
      );

      expect(result).toEqual({ aiJobId: 'job-9' });
      const input = JSON.parse(enqueue.mock.calls[0][2]);
      expect(input.marks).toBe(4);
      expect(input.negativeMarks).toBe(1);
      expect(input.tagIds).toEqual(['t1']);
    });

    it('rejects negativeMarks greater than marks before enqueueing', async () => {
      const enqueue = jest.fn();
      const service = buildService({ jobsService: { enqueue } });

      await expect(
        service.aiGenerate(
          { organizationId: 'org-1', isSuperAdmin: false } as never,
          'user-1',
          { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 2, negativeMarks: 3, tagIds: [] } as never,
        ),
      ).rejects.toThrow(/negativeMarks/i);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('rejects tag ids that do not belong to the caller organization, before anything is billed', async () => {
      const enqueue = jest.fn();
      // Only one of the two requested tags resolves within this organization.
      const findMany = jest.fn().mockResolvedValue([{ id: 't1' }]);
      const service = buildService({
        jobsService: { enqueue },
        tenantPrisma: { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({ tag: { findMany } })) },
      });

      await expect(
        service.aiGenerate(
          { organizationId: 'org-1', isSuperAdmin: false } as never,
          'user-1',
          { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 1, negativeMarks: 0, tagIds: ['t1', 't2'] } as never,
        ),
      ).rejects.toThrow(/tag/i);
      expect(enqueue).not.toHaveBeenCalled();

      // Pin the tenant predicate itself, not just that a lookup happened. The mock resolves
      // regardless of its arguments, so without this the organizationId could be deleted from the
      // query and every test would still pass -- while cross-organization tag ids became
      // attachable. ai-question-generation.processor.spec.ts already asserts this same shape.
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['t1', 't2'] }, organizationId: 'org-1' } }),
      );
    });

    it('refuses to enqueue when the organization has no AI provider configured, reporting it as a fixable 400 (not the resolver\'s bare 500-mapped Error)', async () => {
      const enqueue = jest.fn();
      const service = buildService({
        jobsService: { enqueue },
        // The resolver throws a plain Error -- Nest maps that to a 500, and the web client
        // renders every 500 as "something went wrong, try again", which is actively misleading
        // here (retrying can never work). The service must catch it and rethrow as a
        // BadRequestException with a message naming the real, actionable problem.
        aiApiKeyResolver: { resolve: jest.fn().mockRejectedValue(new Error('No AI provider configured')) },
      });

      await expect(
        service.aiGenerate(
          { organizationId: 'org-1', isSuperAdmin: false } as never,
          'user-1',
          { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 1, negativeMarks: 0, tagIds: [] } as never,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.aiGenerate(
          { organizationId: 'org-1', isSuperAdmin: false } as never,
          'user-1',
          { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 1, negativeMarks: 0, tagIds: [] } as never,
        ),
      ).rejects.toThrow(/AI provider/i);
      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('publishes a draft question by setting status to active', async () => {
      const tx = {
        question: {
          findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
          update: jest.fn().mockResolvedValue({ id: 'q-1', status: 'active', tags: [] }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.publish(context, 'user-1', 'q-1');

      expect(result.status).toBe('active');
      expect(tx.question.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: 'active' },
        include: { options: true, tags: { include: { tag: true } } },
      });
    });

    it('throws NotFoundException when publishing a question that does not exist', async () => {
      const tx = { question: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.publish(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('bulkUpload', () => {
    it('creates valid rows and reports errors for invalid ones from a CSV file', async () => {
      const csv = [
        'Type,Text,Difficulty,Marks,NegativeMarks,Option1Text,Option1Correct,Option2Text,Option2Correct',
        'single_mcq,What is 2+2?,easy,5,0,3,FALSE,4,TRUE',
        'single_mcq,Bad row - two correct,easy,5,0,3,TRUE,4,TRUE',
      ].join('\n');
      const file = { originalname: 'questions.csv', size: Buffer.byteLength(csv), buffer: Buffer.from(csv) } as Express.Multer.File;

      const tx = {
        tag: { upsert: jest.fn() },
        question: { create: jest.fn().mockResolvedValue({ id: 'q-1', options: [], tags: [] }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.bulkUpload(context, 'user-1', file);

      expect(result.created).toHaveLength(1);
      expect(tx.question.create).toHaveBeenCalledTimes(1);
      expect(result.errors).toEqual([{ row: 2, message: 'single_mcq questions must have exactly 1 correct option' }]);
    });

    it('rejects a file with an unsupported extension before parsing', async () => {
      const file = { originalname: 'questions.txt', size: 10, buffer: Buffer.from('irrelevant') } as Express.Multer.File;

      await expect(service.bulkUpload(context, 'user-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('rejects a file larger than 5MB', async () => {
      const file = { originalname: 'questions.csv', size: 6 * 1024 * 1024, buffer: Buffer.from('Type,Text\n') } as Express.Multer.File;

      await expect(service.bulkUpload(context, 'user-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('converts a structurally malformed CSV parse failure into a BadRequestException', async () => {
      const malformedCsv = [
        'Type,Text,Difficulty,Marks,NegativeMarks,Option1Text,Option1Correct,Option2Text,Option2Correct',
        'single_mcq,"Unterminated quote,easy,5,0,3,FALSE,4,TRUE',
      ].join('\n');
      const file = {
        originalname: 'questions.csv',
        size: Buffer.byteLength(malformedCsv),
        buffer: Buffer.from(malformedCsv),
      } as Express.Multer.File;

      await expect(service.bulkUpload(context, 'user-1', file)).rejects.toThrow(BadRequestException);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });
});

describe('QuestionsService.uploadImage', () => {
  let service: QuestionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let jobsService: { enqueue: jest.Mock };
  let examRuntime: { listAvailableLanguages: jest.Mock };
  let blobStorage: { upload: jest.Mock; uploadDataUri: jest.Mock; signIfOurs: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    jobsService = { enqueue: jest.fn() };
    examRuntime = { listAvailableLanguages: jest.fn() };
    blobStorage = {
      upload: jest.fn().mockImplementation((blobPath: string) => Promise.resolve(`https://sfstoragepoc.blob.core.windows.net/ptc-vss-sf-interview-storage-container/${blobPath}`)),
      uploadDataUri: jest.fn(),
      signIfOurs: jest.fn((v) => Promise.resolve(v)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: JobsService, useValue: jobsService },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: BlobStorageService, useValue: blobStorage },
        { provide: AiApiKeyResolverService, useValue: { resolve: jest.fn().mockResolvedValue({ name: 'anthropic' }) } },
      ],
    }).compile();
    service = moduleRef.get(QuestionsService);
  });

  it('uploads a valid PNG to question-images/ and returns its blob URL', async () => {
    const file = { mimetype: 'image/png', size: 1024, buffer: Buffer.from('fake-png-bytes') } as Express.Multer.File;

    const result = await service.uploadImage(file);

    expect(result.imageUrl).toMatch(/^https:\/\/sfstoragepoc\.blob\.core\.windows\.net\/ptc-vss-sf-interview-storage-container\/question-images\/[0-9a-f-]+\.png$/);
    expect(blobStorage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^question-images\/[0-9a-f-]+\.png$/),
      file.buffer,
      'image/png',
    );
  });

  it('rejects a non-image mimetype', async () => {
    const file = { mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;

    await expect(service.uploadImage(file)).rejects.toThrow(BadRequestException);
    expect(blobStorage.upload).not.toHaveBeenCalled();
  });

  it('rejects a file over 2MB', async () => {
    const file = { mimetype: 'image/png', size: 2 * 1024 * 1024 + 1, buffer: Buffer.from('x') } as Express.Multer.File;

    await expect(service.uploadImage(file)).rejects.toThrow(BadRequestException);
    expect(blobStorage.upload).not.toHaveBeenCalled();
  });
});
