import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let jobsService: { enqueue: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    jobsService = { enqueue: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: JobsService, useValue: jobsService },
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

    expect(result).toEqual(created);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('rejects an invalid payload before touching the database', async () => {
    const invalidDto = { ...validDto, options: [{ text: '4', isCorrect: false }, { text: '3', isCorrect: false }] };

    await expect(service.create(context, 'user-1', invalidDto)).rejects.toThrow(BadRequestException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('creates a code question with zero options and persists codeLanguage/starterCode', async () => {
    const codeDto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      codeLanguage: 'javascript',
      starterCode: 'function reverse(str) {\n  \n}',
      options: [],
    };
    const created = {
      id: 'q-1',
      organizationId: 'org-1',
      ...codeDto,
      tags: [],
    };
    const questionCreate = jest.fn().mockResolvedValue(created);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    const result = await service.create(context, 'user-1', codeDto);

    expect(result.type).toBe('code');
    expect(result.options).toEqual([]);
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codeLanguage: 'javascript', starterCode: 'function reverse(str) {\n  \n}' }),
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

    await service.update(context, 'q-1', { ...validDto, tags: ['new-tag'] });

    expect(tx.questionTag.deleteMany).toHaveBeenCalledWith({ where: { questionId: 'q-1' } });
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: { create: [{ tagId: 'tag-new' }] } }) }),
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

    const result = await service.archive(context, 'q-1');

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

    await expect(service.archive(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  describe('aiGenerate', () => {
    it('enqueues an ai-question-generation job with the request fields plus the requesting user', async () => {
      jobsService.enqueue.mockResolvedValue({ id: 'job-1' });

      const result = await service.aiGenerate(context, 'user-1', {
        topic: 'React hooks',
        difficulty: 'medium',
        questionTypes: ['single_mcq'],
        count: 5,
      });

      expect(result).toEqual({ aiJobId: 'job-1' });
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        context,
        'ai-question-generation',
        JSON.stringify({ topic: 'React hooks', difficulty: 'medium', questionTypes: ['single_mcq'], count: 5, requestedBy: 'user-1' }),
        'user-1',
      );
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

      const result = await service.publish(context, 'q-1');

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

      await expect(service.publish(context, 'missing-id')).rejects.toThrow(NotFoundException);
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
