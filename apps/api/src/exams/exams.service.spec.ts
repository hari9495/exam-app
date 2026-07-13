import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';

describe('ExamsService', () => {
  let service: ExamsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let examRuntime: { settleIfExpiredBatch: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    examRuntime = { settleIfExpiredBatch: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExamsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(ExamsService);
  });

  it("creates an exam scoped to the caller's organization", async () => {
    const created = { id: 'exam-1', organizationId: 'org-1', title: 'Backend Round' };
    tenantPrisma.forTenant.mockResolvedValue(created);

    const result = await service.create(context, 'user-1', { title: 'Backend Round' });

    expect(result).toEqual(created);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('passes durationMinutes and passCriteriaPercent through to the created exam when provided', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Backend Round', durationMinutes: 45, passCriteriaPercent: 60 });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        title: 'Backend Round',
        instructions: undefined,
        durationMinutes: 45,
        passCriteriaPercent: 60,
        randomizeOrder: undefined,
        createdBy: 'user-1',
      },
    });
  });

  it('lets the database default apply to durationMinutes/passCriteriaPercent when omitted', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Backend Round' });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        title: 'Backend Round',
        instructions: undefined,
        durationMinutes: undefined,
        passCriteriaPercent: undefined,
        randomizeOrder: undefined,
        createdBy: 'user-1',
      },
    });
  });

  it("lists exams scoped to the caller's organization, excluding archived by default", async () => {
    const tx = { exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', status: 'draft' }]) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tx.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'archived' } }) }),
    );
  });

  it('lists exams filtered by an explicit status', async () => {
    const tx = { exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', status: 'published' }]) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, { status: 'published' });

    expect(result).toHaveLength(1);
    expect(tx.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'published' }) }),
    );
  });

  it('throws NotFoundException when findOne cannot find the exam', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ exam: { findFirst: jest.fn().mockResolvedValue(null) } }));

    await expect(service.findOne(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it("updates an exam's title and instructions", async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Updated Title' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.update(context, 'exam-1', { title: 'Updated Title' });

    expect(result.title).toBe('Updated Title');
    expect(tx.exam.update).toHaveBeenCalledWith({
      where: { id: 'exam-1' },
      data: { title: 'Updated Title', instructions: undefined },
    });
  });

  it('throws NotFoundException when updating an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.update(context, 'missing-id', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('archives an exam by setting status to archived', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'archived' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.archive(context, 'user-1', 'exam-1');

    expect(result.status).toBe('archived');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'archived' } });
    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1', action: 'exam.archived', entityType: 'exam', entityId: 'exam-1',
    });
  });

  it('throws NotFoundException when archiving an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.archive(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('creates a section appended after the current last orderIndex', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ orderIndex: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 3 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.createSection(context, 'exam-1', { title: 'Section B' });

    expect(result.orderIndex).toBe(3);
    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Section B', orderIndex: 3, targetDurationMinutes: undefined },
    });
  });

  it('creates a section with a target duration when provided', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 0, targetDurationMinutes: 20 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.createSection(context, 'exam-1', { title: 'Section A', targetDurationMinutes: 20 });

    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Section A', orderIndex: 0, targetDurationMinutes: 20 },
    });
  });

  it('throws NotFoundException when creating a section under a missing exam', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'missing-exam', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when updating a section that does not belong to the given exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.updateSection(context, 'exam-1', 'wrong-section', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('updates a section\'s title without touching pool data when staying fixed', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Renamed', selectionMode: 'fixed' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Renamed' });

    expect(tx.examSectionQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSectionPoolTag.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Renamed', selectionMode: 'fixed', poolSize: null, poolDifficulty: null },
      include: { poolTags: true },
    });
  });

  it('sets a target duration on update when provided', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Section', targetDurationMinutes: 15 }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Section', targetDurationMinutes: 15 });

    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Section', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 15 },
      include: { poolTags: true },
    });
  });

  it('leaves an existing target duration untouched when omitted from the update', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 15 }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Renamed', targetDurationMinutes: 15 }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Renamed' });

    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Renamed', selectionMode: 'fixed', poolSize: null, poolDifficulty: null },
      include: { poolTags: true },
    });
  });

  it('switches a section from fixed to pool, clearing existing question links and storing pool criteria', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Pool Section', selectionMode: 'pool' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', {
      title: 'Pool Section', selectionMode: 'pool', poolSize: 5, poolDifficulty: 'hard', poolTagIds: ['tag-1', 'tag-2'],
    });

    expect(tx.examSectionQuestion.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSectionPoolTag.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: {
        title: 'Pool Section',
        selectionMode: 'pool',
        poolSize: 5,
        poolDifficulty: 'hard',
        poolTags: { create: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }] },
      },
      include: { poolTags: true },
    });
  });

  it('switches a section from pool back to fixed, clearing pool criteria', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'pool', poolSize: 5, poolDifficulty: 'hard' }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Section', selectionMode: 'fixed' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Section', selectionMode: 'fixed' });

    expect(tx.examSectionPoolTag.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSectionQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Section', selectionMode: 'fixed', poolSize: null, poolDifficulty: null },
      include: { poolTags: true },
    });
  });

  it('deduplicates duplicate poolTagIds when updating pool section to avoid PK violation', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'pool', poolSize: 5, poolDifficulty: 'hard' }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Pool Section', selectionMode: 'pool' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', {
      title: 'Pool Section', selectionMode: 'pool', poolSize: 5, poolDifficulty: 'hard', poolTagIds: ['tag-1', 'tag-1', 'tag-2'],
    });

    expect(tx.examSectionPoolTag.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: {
        title: 'Pool Section',
        selectionMode: 'pool',
        poolSize: 5,
        poolDifficulty: 'hard',
        poolTags: { create: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }] },
      },
      include: { poolTags: true },
    });
  });

  it('rejects clearing poolTagIds to an empty array on an already-pool section, without mutating anything', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'section-1', selectionMode: 'pool', poolSize: 5, poolDifficulty: null, poolTags: [{ tagId: 'tag-1' }],
        }),
        update: jest.fn(),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(
      service.updateSection(context, 'exam-1', 'section-1', { title: 'X', poolTagIds: [] }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.examSectionPoolTag.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSection.update).not.toHaveBeenCalled();
  });

  it('rejects zeroing out poolSize on an already-pool section, without mutating anything', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'section-1', selectionMode: 'pool', poolSize: 5, poolDifficulty: null, poolTags: [{ tagId: 'tag-1' }],
        }),
        update: jest.fn(),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(
      service.updateSection(context, 'exam-1', 'section-1', { title: 'X', poolSize: 0 }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.examSectionPoolTag.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSection.update).not.toHaveBeenCalled();
  });

  it('allows a title-only update on an already-valid pool section', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'section-1', selectionMode: 'pool', poolSize: 5, poolDifficulty: null, poolTags: [{ tagId: 'tag-1' }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Renamed', selectionMode: 'pool' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Renamed' });

    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Renamed', selectionMode: 'pool', poolSize: 5, poolDifficulty: null },
      include: { poolTags: true },
    });
  });

  it('deletes a section that belongs to the given exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'section-1' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.deleteSection(context, 'exam-1', 'section-1');

    expect(tx.examSection.delete).toHaveBeenCalledWith({ where: { id: 'section-1' } });
  });

  it('throws NotFoundException from replaceSectionQuestions when a questionId does not resolve in this organization', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: { findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }) },
      examSectionQuestion: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(NotFoundException);
  });

  it('rejects replaceSectionQuestions when a newly-added question is archived', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: { findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }) },
      examSectionQuestion: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', status: 'archived' }]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(BadRequestException);
  });

  it("replaces a section's questions, keeping an already-linked archived question", async () => {
    const updatedSection = {
      id: 'section-1',
      questions: [
        { questionId: 'q1', orderIndex: 0, question: { id: 'q1', options: [] } },
        { questionId: 'q2', orderIndex: 1, question: { id: 'q2', options: [] } },
      ],
    };
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'section-1' })
          .mockResolvedValueOnce(updatedSection),
      },
      examSectionQuestion: {
        findMany: jest.fn().mockResolvedValue([{ questionId: 'q1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      question: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'q1', status: 'archived' },
          { id: 'q2', status: 'active' },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1', 'q2']);

    expect(result).toEqual(updatedSection);
    expect(tx.examSectionQuestion.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSectionQuestion.createMany).toHaveBeenCalledWith({
      data: [
        { sectionId: 'section-1', questionId: 'q1', orderIndex: 0 },
        { sectionId: 'section-1', questionId: 'q2', orderIndex: 1 },
      ],
    });
  });

  it('publishes a draft exam that has at least one section with at least one question in each', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{ id: 'section-1', title: 'Section One', questions: [{ questionId: 'q1' }] }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'user-1', 'exam-1');

    expect(result.status).toBe('published');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'published' } });
    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1',
    });
  });

  it('throws NotFoundException when publishing an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when publishing an exam that is not in draft status', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', sections: [] }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when publishing an exam with no sections', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft', sections: [] }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when publishing an exam with a section that has no questions', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Section One', questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', questions: [] },
          ],
        }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
  });

  it('publishes a draft exam whose pool section has enough matching questions', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Pool Section', selectionMode: 'pool', poolSize: 3, poolDifficulty: 'hard', questions: [], poolTags: [{ tagId: 'tag-1' }] },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
      question: { count: jest.fn().mockResolvedValue(3) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'user-1', 'exam-1');

    expect(result.status).toBe('published');
    expect(tx.question.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'active', difficulty: 'hard', AND: [{ tags: { some: { tagId: 'tag-1' } } }] },
    });
  });

  it('rejects publish when a pool section has fewer matching questions than its pool size', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Pool Section', selectionMode: 'pool', poolSize: 5, poolDifficulty: null, questions: [], poolTags: [{ tagId: 'tag-1' }] },
          ],
        }),
      },
      question: { count: jest.fn().mockResolvedValue(3) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
  });

  describe('getResults', () => {
    it('throws NotFoundException when the exam does not exist', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getResults(context, 'missing-exam')).rejects.toThrow(NotFoundException);
    });

    it('returns one row per invitation, with nulls for candidates who have not started', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: null },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: null,
          status: 'invited', score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
          proctoringAnalysis: null,
        },
      ]);
    });

    it('returns the graded result for a submitted attempt', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const submittedAt = new Date();
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' },
              attempt: {
                id: 'attempt-1', status: 'submitted', submittedAt,
                result: { score: 8, maxScore: 10, percentage: 80, passFail: 'pass' },
                proctoringAnalysis: null,
              },
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1',
          status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt,
          proctoringAnalysis: null,
        },
      ]);
      expect(examRuntime.settleIfExpiredBatch).not.toHaveBeenCalled();
    });

    it('settles an in-progress attempt past its deadline before reporting it', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const inProgressAttempt = { id: 'attempt-1', status: 'in_progress', result: null };
      const settledAttempt = { id: 'attempt-1', status: 'auto_submitted', submittedAt: new Date() };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: inProgressAttempt },
          ]),
        },
        attempt: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              {
                ...settledAttempt,
                result: { score: 4, maxScore: 10, percentage: 40, passFail: 'pass' },
                proctoringAnalysis: null,
              },
            ]),
        },
      };
      examRuntime.settleIfExpiredBatch.mockResolvedValue(undefined);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(examRuntime.settleIfExpiredBatch).toHaveBeenCalledWith([inProgressAttempt.id]);
      expect(tx.attempt.findMany).toHaveBeenCalledWith({
        where: { id: { in: [inProgressAttempt.id] } },
        include: { result: true, proctoringAnalysis: true },
      });
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
      expect(result[0].status).toBe('auto_submitted');
      expect(result[0].passFail).toBe('pass');
    });

    it('batches all in-progress attempts into a single settleIfExpiredBatch call', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const attempt1 = { id: 'attempt-1', status: 'in_progress', result: null };
      const attempt2 = { id: 'attempt-2', status: 'in_progress', result: null };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: attempt1 },
            { id: 'inv-2', candidateId: 'cand-2', status: 'invited', candidate: { name: 'Bob' }, attempt: attempt2 },
          ]),
        },
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { ...attempt1, status: 'auto_submitted', submittedAt: new Date(), result: null, proctoringAnalysis: null },
            { ...attempt2, status: 'auto_submitted', submittedAt: new Date(), result: null, proctoringAnalysis: null },
          ]),
        },
      };
      examRuntime.settleIfExpiredBatch.mockResolvedValue(undefined);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getResults(context, 'exam-1');

      expect(examRuntime.settleIfExpiredBatch).toHaveBeenCalledTimes(1);
      expect(examRuntime.settleIfExpiredBatch).toHaveBeenCalledWith(['attempt-1', 'attempt-2']);
    });

    it('does not open a second transaction when no attempts need settling', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' },
              attempt: { id: 'attempt-1', status: 'submitted', submittedAt: new Date(), result: null, proctoringAnalysis: null },
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getResults(context, 'exam-1');

      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
      expect(examRuntime.settleIfExpiredBatch).not.toHaveBeenCalled();
    });

    it('includes the proctoring analysis for a settled attempt, and null when none exists yet', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' },
              attempt: {
                id: 'attempt-1', status: 'submitted', submittedAt: new Date(),
                result: { score: 5, maxScore: 5, percentage: 100, passFail: 'pass' },
                proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'Nothing notable.' },
              },
            },
            {
              id: 'inv-2', candidateId: 'cand-2', status: 'invited', candidate: { name: 'Bob' },
              attempt: null,
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(result[0].proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'low', summary: 'Nothing notable.' });
      expect(result[1].proctoringAnalysis).toBeNull();
    });
  });
});
