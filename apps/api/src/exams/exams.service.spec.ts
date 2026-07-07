import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('ExamsService', () => {
  let service: ExamsService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [ExamsService, { provide: TenantPrismaService, useValue: tenantPrisma }],
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

  it("lists exams scoped to the caller's organization, defaulting to active status", async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'exam-1', status: 'active' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
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

    const result = await service.archive(context, 'exam-1');

    expect(result.status).toBe('archived');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'archived' } });
  });

  it('throws NotFoundException when archiving an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.archive(context, 'missing-id')).rejects.toThrow(NotFoundException);
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
    expect(tx.examSection.create).toHaveBeenCalledWith({ data: { examId: 'exam-1', title: 'Section B', orderIndex: 3 } });
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
});
