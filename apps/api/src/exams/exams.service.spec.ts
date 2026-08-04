import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { TOGGLEABLE_PROCTORING_SIGNALS } from './dto/create-exam.dto';
import { TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';

describe('ExamsService', () => {
  let service: ExamsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let examRuntime: { settleIfExpiredBatch: jest.Mock };
  let audit: { record: jest.Mock };
  let blobStorage: { signIfOurs: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    examRuntime = { settleIfExpiredBatch: jest.fn() };
    audit = { record: jest.fn() };
    // Identity pass-through by default -- signing behaviour itself is covered end
    // to end in blob-storage.service.spec.ts, same convention as ReportsService.
    blobStorage = { signIfOurs: jest.fn(async (value) => value) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExamsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
        { provide: AuditService, useValue: audit },
        { provide: BlobStorageService, useValue: blobStorage },
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

  it('records an exam.created audit event with the creator as actor', async () => {
    tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', title: 'Backend Round' });

    await service.create(context, 'user-1', { title: 'Backend Round' });

    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1',
      action: 'exam.created',
      entityType: 'exam',
      entityId: 'exam-1',
      metadata: { title: 'Backend Round' },
    });
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
        feedbackVisibility: undefined,
        schedulingEnabled: false,
        availabilityWindowStart: null,
        availabilityWindowEnd: null,
        allowedIpRange: null,
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
        feedbackVisibility: undefined,
        schedulingEnabled: false,
        availabilityWindowStart: null,
        availabilityWindowEnd: null,
        allowedIpRange: null,
        createdBy: 'user-1',
      },
    });
  });

  it('persists feedbackVisibility on create when provided', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Exam', feedbackVisibility: 'score' });

    expect(tx.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feedbackVisibility: 'score' }) }),
    );
  });

  it('updates feedbackVisibility when provided', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', feedbackVisibility: 'breakdown', schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam', feedbackVisibility: 'breakdown' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ feedbackVisibility: 'breakdown' }) }),
    );
  });

  it('creates a scheduled exam with schedulingEnabled true and a valid window', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', {
      title: 'Scheduled Exam',
      schedulingEnabled: true,
      availabilityWindowStart: '2026-07-20T09:00:00.000Z',
      availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
    });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schedulingEnabled: true,
        availabilityWindowStart: new Date('2026-07-20T09:00:00.000Z'),
        availabilityWindowEnd: new Date('2026-07-27T18:00:00.000Z'),
      }),
    });
  });

  it('rejects schedulingEnabled true with a missing window field', async () => {
    const tx = { exam: { create: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(
      service.create(context, 'user-1', {
        title: 'Bad Exam',
        schedulingEnabled: true,
        availabilityWindowStart: '2026-07-20T09:00:00.000Z',
      }),
    ).rejects.toThrow('Scheduling requires both an availability window start and end');
    expect(tx.exam.create).not.toHaveBeenCalled();
  });

  it('rejects an availability window whose end is not after its start', async () => {
    const tx = { exam: { create: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(
      service.create(context, 'user-1', {
        title: 'Bad Exam',
        schedulingEnabled: true,
        availabilityWindowStart: '2026-07-27T18:00:00.000Z',
        availabilityWindowEnd: '2026-07-20T09:00:00.000Z',
      }),
    ).rejects.toThrow('The availability window end must be after its start');
    expect(tx.exam.create).not.toHaveBeenCalled();
  });

  it('creates a non-scheduled exam with null window fields when schedulingEnabled is omitted', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Normal Exam' });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schedulingEnabled: false,
        availabilityWindowStart: null,
        availabilityWindowEnd: null,
      }),
    });
  });

  it("lists exams scoped to the caller's organization, excluding archived by default", async () => {
    const tx = {
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', status: 'draft' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      invitation: { groupBy: jest.fn().mockResolvedValue([]) },
      attempt: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, {});

    expect(result.data).toHaveLength(1);
    expect(result).toEqual(expect.objectContaining({ total: 1, page: 1, pageSize: 20, totalPages: 1 }));
    expect(tx.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'archived' } }) }),
    );
  });

  it('lists exams filtered by an explicit status', async () => {
    const tx = {
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', status: 'published' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      invitation: { groupBy: jest.fn().mockResolvedValue([]) },
      attempt: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, { status: 'published' });

    expect(result.data).toHaveLength(1);
    expect(tx.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'published' }) }),
    );
  });

  it('returns invitation and attempt-progress counts alongside each exam', async () => {
    const tx = {
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', status: 'published', organizationId: 'org-1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      invitation: {
        groupBy: jest.fn().mockResolvedValue([{ examId: 'exam-1', _count: { _all: 20 } }]),
      },
      attempt: {
        groupBy: jest.fn().mockResolvedValue([
          { examId: 'exam-1', status: 'submitted', _count: { _all: 12 } },
          { examId: 'exam-1', status: 'auto_submitted', _count: { _all: 2 } },
          { examId: 'exam-1', status: 'in_progress', _count: { _all: 3 } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, {});

    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'exam-1',
        invitationCount: 20,
        attemptSettledCount: 14,
        attemptTotalCount: 17,
      }),
    ]);
  });

  it('paginates results and filters by search on title', async () => {
    const tx = {
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-2', title: 'Backend Interview', createdAt: new Date() }]),
        count: jest.fn().mockResolvedValue(1),
      },
      invitation: { groupBy: jest.fn().mockResolvedValue([]) },
      attempt: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, { page: '2', pageSize: '1', search: 'Backend' });

    expect(tx.exam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ title: { contains: 'Backend' } }),
        skip: 1,
        take: 1,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ total: 1, page: 2, pageSize: 1, totalPages: 1 }),
    );
    expect(result.data).toHaveLength(1);
  });

  it('throws NotFoundException when findOne cannot find the exam', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ exam: { findFirst: jest.fn().mockResolvedValue(null) } }));

    await expect(service.findOne(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('includes invitationCount on findOne so the frontend can gate editing a published exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', sections: [] }) },
      invitation: { count: jest.fn().mockResolvedValue(3) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.findOne(context, 'exam-1');

    expect(result.invitationCount).toBe(3);
    expect(tx.invitation.count).toHaveBeenCalledWith({ where: { examId: 'exam-1' } });
    expect(result.hasStartedAttempts).toBe(false);
  });

  it('includes hasStartedAttempts on findOne so the frontend can lock the whole exam once a candidate has started', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', sections: [] }) },
      invitation: { count: jest.fn().mockResolvedValue(3) },
      attempt: { count: jest.fn().mockResolvedValue(2) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.findOne(context, 'exam-1');

    expect(result.hasStartedAttempts).toBe(true);
    expect(tx.attempt.count).toHaveBeenCalledWith({ where: { examId: 'exam-1' } });
  });

  describe('findOne requiresManualGrading', () => {
    const fixedQuestion = (type: string) => ({ orderIndex: 0, question: { type, options: [] } });

    it('is false when no section has a code question and there are no pool sections', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            sections: [{ selectionMode: 'fixed', questions: [fixedQuestion('single_mcq'), fixedQuestion('true_false')] }],
          }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.findOne(context, 'exam-1');

      expect(result.requiresManualGrading).toBe(false);
    });

    it('is true when a fixed section has at least one code question', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            sections: [{ selectionMode: 'fixed', questions: [fixedQuestion('single_mcq'), fixedQuestion('code')] }],
          }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.findOne(context, 'exam-1');

      expect(result.requiresManualGrading).toBe(true);
    });

    it('is true when a pool section currently matches at least one active code question in the bank', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            sections: [{ selectionMode: 'pool', poolDifficulty: 'medium', poolTags: [{ tagId: 'tag-1' }], questions: [] }],
          }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        question: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.findOne(context, 'exam-1');

      expect(result.requiresManualGrading).toBe(true);
      expect(tx.question.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'code', difficulty: 'medium' }) }),
      );
    });

    it('is false when a pool section matches no code questions and nothing is pending grade', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            sections: [{ selectionMode: 'pool', poolDifficulty: 'medium', poolTags: [{ tagId: 'tag-1' }], questions: [] }],
          }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        question: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.findOne(context, 'exam-1');

      expect(result.requiresManualGrading).toBe(false);
    });

    it('is true when nothing currently matches code but an attempt is still waiting on manual grading', async () => {
      // Covers a pool whose tag composition changed after an attempt already drew a
      // code question from it -- the live match check alone would wrongly hide the tab.
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            sections: [{ selectionMode: 'pool', poolDifficulty: 'medium', poolTags: [{ tagId: 'tag-1' }], questions: [] }],
          }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0) },
        attempt: { count: jest.fn(({ where }) => Promise.resolve(where.status === 'pending_manual_grade' ? 1 : 0)) },
        question: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.findOne(context, 'exam-1');

      expect(result.requiresManualGrading).toBe(true);
      expect(result.hasStartedAttempts).toBe(false);
    });
  });

  it("updates an exam's title and instructions", async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Updated Title', schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.update(context, 'user-1', 'exam-1', { title: 'Updated Title' });

    expect(result.title).toBe('Updated Title');
    expect(tx.exam.update).toHaveBeenCalledWith({
      where: { id: 'exam-1' },
      data: {
        title: 'Updated Title',
        instructions: undefined,
        schedulingEnabled: false,
        availabilityWindowStart: null,
        availabilityWindowEnd: null,
      },
    });
  });

  it('rejects update() entirely once a candidate has started an attempt, even for an unrelated field like title', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }), update: jest.fn() },
      attempt: { count: jest.fn().mockResolvedValue(1) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.update(context, 'user-1', 'exam-1', { title: 'New Title' })).rejects.toThrow(ConflictException);
    expect(tx.exam.update).not.toHaveBeenCalled();
  });

  it('rejects update() while the exam is published, even with zero attempts, pointing at unpublish', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }), update: jest.fn() },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.update(context, 'user-1', 'exam-1', { title: 'New Title' })).rejects.toThrow(
      /unpublish it before editing/i,
    );
    expect(tx.exam.update).not.toHaveBeenCalled();
  });

  it('allows update() on a draft exam with zero attempts (status check does not false-positive)', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1', status: 'draft', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'New Title', schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.update(context, 'user-1', 'exam-1', { title: 'New Title' })).resolves.toMatchObject({ title: 'New Title' });
  });

  it('persists walkInEnabled when provided', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          walkInEnabled: false,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', walkInEnabled: true, schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam', walkInEnabled: true });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walkInEnabled: true }) }),
    );
  });

  it('leaves walkInEnabled untouched when omitted from the update', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          walkInEnabled: true,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', walkInEnabled: true, schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ walkInEnabled: expect.anything() }) }),
    );
  });

  it('setWalkInEnabled updates walkInEnabled even when the exam is published', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', walkInEnabled: false }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', walkInEnabled: true }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.setWalkInEnabled(context, 'user-1', 'exam-1', true)).resolves.toMatchObject({ walkInEnabled: true });

    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { walkInEnabled: true } });
  });

  it('setWalkInEnabled throws when the exam does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.setWalkInEnabled(context, 'user-1', 'missing', true)).rejects.toThrow('not found');
  });

  it('persists walkInListed when provided', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null,
          availabilityWindowEnd: null, walkInListed: true,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', walkInListed: false, schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam', walkInListed: false });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walkInListed: false }) }),
    );
  });

  it('leaves walkInListed untouched when omitted from the update', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null,
          availabilityWindowEnd: null, walkInListed: true,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', walkInListed: true, schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ walkInListed: expect.anything() }) }),
    );
  });

  it('setWalkInListed updates walkInListed even when the exam is published', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', walkInListed: true }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', walkInListed: false }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.setWalkInListed(context, 'user-1', 'exam-1', false)).resolves.toMatchObject({ walkInListed: false });

    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { walkInListed: false } });
  });

  it('setWalkInListed throws when the exam does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.setWalkInListed(context, 'user-1', 'missing', true)).rejects.toThrow('not found');
  });

  it('persists allowedIpRange on create', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Exam', allowedIpRange: '203.0.113.0/24' });

    expect(tx.exam.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowedIpRange: '203.0.113.0/24' }) }),
    );
  });

  it('persists allowedIpRange when provided on update, and clears it with null', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          allowedIpRange: '203.0.113.0/24',
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', allowedIpRange: null, schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam', allowedIpRange: '198.51.100.5' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowedIpRange: '198.51.100.5' }) }),
    );

    tx.exam.update.mockClear();
    await service.update(context, 'user-1', 'exam-1', { title: 'Exam', allowedIpRange: '' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowedIpRange: null }) }),
    );
  });

  it('leaves allowedIpRange untouched when omitted from the update', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          allowedIpRange: '203.0.113.0/24',
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', allowedIpRange: '203.0.113.0/24', schedulingEnabled: false }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'Exam' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ allowedIpRange: expect.anything() }) }),
    );
  });

  it('throws NotFoundException when updating an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.update(context, 'user-1', 'missing-id', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('update() re-syncs expiresAt on not-yet-started invitations when the window changes', async () => {
    const newEnd = '2026-08-01T18:00:00.000Z';
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: true,
          availabilityWindowStart: new Date('2026-07-20T09:00:00.000Z'),
          availabilityWindowEnd: new Date('2026-07-27T18:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: true,
          availabilityWindowStart: new Date('2026-07-20T09:00:00.000Z'),
          availabilityWindowEnd: new Date(newEnd),
        }),
      },
      invitation: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'inv-not-started', status: 'invited', attempt: null },
          { id: 'inv-started', status: 'invited', attempt: { id: 'attempt-1' } },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'exam-1', availabilityWindowEnd: newEnd });

    expect(tx.invitation.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inv-not-started'] } },
      data: { expiresAt: new Date(newEnd) },
    });
  });

  it('update() does not touch invitations when schedulingEnabled is false', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'New Title', schedulingEnabled: false }),
      },
      invitation: { findMany: jest.fn(), updateMany: jest.fn() },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'user-1', 'exam-1', { title: 'New Title' });

    expect(tx.invitation.findMany).not.toHaveBeenCalled();
    expect(tx.invitation.updateMany).not.toHaveBeenCalled();
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        // First findFirst = duplicate-title check (none), second = last-orderIndex lookup.
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ orderIndex: 2 }),
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

  it('rejects createSection when a section with the same title already exists in the exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing', title: 'Reasoning' }),
        create: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'exam-1', { title: 'Reasoning' })).rejects.toThrow(BadRequestException);
    expect(tx.examSection.create).not.toHaveBeenCalled();
  });

  it('creates a section with a target duration when provided', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
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

  it('rejects createSection once a candidate has started an attempt', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(1) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'exam-1', { title: 'x' })).rejects.toThrow(ConflictException);
  });

  it('allows createSection when no candidate has started an attempt yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 0 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'exam-1', { title: 'x' })).resolves.toBeDefined();
  });

  it('rejects createSection while the exam is published, even with no candidate started yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'exam-1', { title: 'x' })).rejects.toThrow(ConflictException);
  });

  it('allows createSection when candidates are invited but none has started an attempt yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
      invitation: { count: jest.fn().mockResolvedValue(5) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 0 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'exam-1', { title: 'x' })).resolves.toBeDefined();
  });

  it('throws NotFoundException when updating a section that does not belong to the given exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.updateSection(context, 'exam-1', 'wrong-section', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('rejects updateSection once a candidate has started an attempt', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(1) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.updateSection(context, 'exam-1', 'section-1', { title: 'x' })).rejects.toThrow(ConflictException);
  });

  it('rejects updateSection while the exam is published, even with no candidate started yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.updateSection(context, 'exam-1', 'section-1', { title: 'x' })).rejects.toThrow(ConflictException);
  });

  it('allows updateSection when candidates are invited but none has started an attempt yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
      invitation: { count: jest.fn().mockResolvedValue(4) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Renamed', selectionMode: 'fixed' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.updateSection(context, 'exam-1', 'section-1', { title: 'Renamed' })).resolves.toBeDefined();
  });

  it('updates a section\'s title without touching pool data when staying fixed', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'section-1' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    // Regression for ADO #6838: a void return produced an empty 200 body, which apiFetch's
    // unconditional response.json() threw on client-side even though the delete succeeded.
    await expect(service.deleteSection(context, 'exam-1', 'section-1')).resolves.toEqual({ success: true });

    expect(tx.examSection.delete).toHaveBeenCalledWith({ where: { id: 'section-1' } });
  });

  it('rejects deleteSection once a candidate has started an attempt', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(1) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.deleteSection(context, 'exam-1', 'section-1')).rejects.toThrow(ConflictException);
  });

  it('rejects deleteSection while the exam is published, even with no candidate started yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.deleteSection(context, 'exam-1', 'section-1')).rejects.toThrow(ConflictException);
  });

  describe('duplicateSection', () => {
    it("clones a fixed-mode section's title and settings WITHOUT copying its questions", async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        examSection: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'section-1',
              title: 'Aptitude',
              selectionMode: 'fixed',
              poolSize: null,
              poolDifficulty: null,
              targetDurationMinutes: 10,
              questions: [{ questionId: 'q1', orderIndex: 0 }, { questionId: 'q2', orderIndex: 1 }],
              poolTags: [],
            })
            .mockResolvedValueOnce({ id: 'section-2', orderIndex: 1 }),
          create: jest.fn().mockResolvedValue({ id: 'section-3', title: 'Aptitude (Copy)' }),
        },
        examSectionQuestion: { createMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.duplicateSection(context, 'exam-1', 'section-1');

      expect(tx.examSection.create).toHaveBeenCalledWith({
        data: {
          examId: 'exam-1',
          title: 'Aptitude (Copy)',
          orderIndex: 2,
          selectionMode: 'fixed',
          poolSize: null,
          poolDifficulty: null,
          targetDurationMinutes: 10,
        },
      });
      // Questions must NOT be copied: doing so would put the same question in two sections of
      // one exam, which corrupts the candidate's per-question answer/mark state.
      expect(tx.examSectionQuestion.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'section-3', title: 'Aptitude (Copy)' });
    });

    it('clones a pool-mode section along with its pool tags', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        examSection: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'section-1',
              title: 'Reasoning',
              selectionMode: 'pool',
              poolSize: 5,
              poolDifficulty: 'medium',
              targetDurationMinutes: null,
              questions: [],
              poolTags: [{ tagId: 'tag-1' }],
            })
            .mockResolvedValueOnce(null),
          create: jest.fn().mockResolvedValue({ id: 'section-2', title: 'Reasoning (Copy)' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicateSection(context, 'exam-1', 'section-1');

      expect(tx.examSection.create).toHaveBeenCalledWith({
        data: {
          examId: 'exam-1',
          title: 'Reasoning (Copy)',
          orderIndex: 0,
          selectionMode: 'pool',
          poolSize: 5,
          poolDifficulty: 'medium',
          targetDurationMinutes: null,
          poolTags: { create: [{ tagId: 'tag-1' }] },
        },
      });
    });

    it('throws NotFoundException when the source section does not belong to the given exam', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        examSection: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.duplicateSection(context, 'exam-1', 'section-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicateSection once a candidate has started an attempt', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
        attempt: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.duplicateSection(context, 'exam-1', 'section-1')).rejects.toThrow(ConflictException);
    });

    it('rejects duplicateSection while the exam is published, even with no candidate started yet', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.duplicateSection(context, 'exam-1', 'section-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('previewSectionPool', () => {
    it("runs the exact same eligibility query attempt-start uses (minus shuffle) and reports the count vs the configured poolSize", async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
        examSection: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'section-1',
            selectionMode: 'pool',
            poolSize: 10,
            poolDifficulty: 'medium',
            poolTags: [{ tagId: 'tag-1', tag: { id: 'tag-1', name: 'Arrays' } }],
          }),
        },
        question: {
          count: jest.fn().mockResolvedValue(3),
          findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Q1', type: 'single_mcq', difficulty: 'medium', marks: 5 }]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.previewSectionPool(context, 'exam-1', 'section-1');

      const expectedWhere = {
        organizationId: 'org-1',
        status: 'active',
        difficulty: 'medium',
        AND: [{ tags: { some: { tagId: 'tag-1' } } }],
      };
      expect(tx.question.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(tx.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere, take: 50 }),
      );
      expect(result).toEqual({
        poolSize: 10,
        poolDifficulty: 'medium',
        poolTags: [{ id: 'tag-1', name: 'Arrays' }],
        totalMatching: 3,
        questions: [{ id: 'q1', text: 'Q1', type: 'single_mcq', difficulty: 'medium', marks: 5 }],
      });
    });

    it('omits the difficulty filter when the section has none set', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
        examSection: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'section-1',
            selectionMode: 'pool',
            poolSize: 5,
            poolDifficulty: null,
            poolTags: [],
          }),
        },
        question: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.previewSectionPool(context, 'exam-1', 'section-1');

      expect(tx.question.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', status: 'active', AND: [] },
      });
    });

    it('rejects previewing a fixed-mode section', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
        examSection: { findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed' }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.previewSectionPool(context, 'exam-1', 'section-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the section does not belong to the given exam', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
        examSection: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.previewSectionPool(context, 'exam-1', 'section-1')).rejects.toThrow(NotFoundException);
    });
  });

  it('throws NotFoundException from replaceSectionQuestions when a questionId does not resolve in this organization', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: { findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }) },
      examSectionQuestion: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(NotFoundException);
  });

  it('rejects replaceSectionQuestions once a candidate has started an attempt', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(1) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(ConflictException);
  });

  it('rejects replaceSectionQuestions while the exam is published, even with no candidate started yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(ConflictException);
  });

  it('allows replaceSectionQuestions when candidates are invited but none has started an attempt yet', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
      invitation: { count: jest.fn().mockResolvedValue(3) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'section-1' })
          .mockResolvedValueOnce({ id: 'section-1', questions: [] }),
      },
      examSectionQuestion: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', status: 'active' }]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).resolves.toBeDefined();
  });

  it('rejects replaceSectionQuestions when a newly-added question is archived', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
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
        { questionId: 'q1', orderIndex: 0, question: { id: 'q1', imageUrl: null, options: [] } },
        { questionId: 'q2', orderIndex: 1, question: { id: 'q2', imageUrl: null, options: [] } },
      ],
    };
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'section-1' })
          .mockResolvedValueOnce(updatedSection),
      },
      examSectionQuestion: {
        // First findMany = this section's current links; second = other sections' links
        // (empty here, so nothing conflicts across sections).
        findMany: jest.fn().mockResolvedValueOnce([{ questionId: 'q1' }]).mockResolvedValueOnce([]),
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

  it('rejects replaceSectionQuestions when a question is already in another section of the exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'section-2' }) },
      examSectionQuestion: {
        // section-2 currently empty; q2 already lives in another section of this exam.
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ questionId: 'q2' }]),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      question: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'q1', status: 'active' },
          { id: 'q2', status: 'active' },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-2', ['q1', 'q2'])).rejects.toThrow(
      /already used in another section/,
    );
    // Must not have mutated anything.
    expect(tx.examSectionQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSectionQuestion.createMany).not.toHaveBeenCalled();
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

  it('unpublishes a published exam that no candidate has started, reverting it to draft', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }),
      },
      attempt: { count: jest.fn().mockResolvedValue(0) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.unpublish(context, 'user-1', 'exam-1');

    expect(result.status).toBe('draft');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'draft' } });
    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1', action: 'exam.unpublished', entityType: 'exam', entityId: 'exam-1',
    });
  });

  it('throws NotFoundException when unpublishing an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.unpublish(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when unpublishing an exam that is not published', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.unpublish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when unpublishing after a candidate has started', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      attempt: { count: jest.fn().mockResolvedValue(1) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.unpublish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
    expect(audit.record).not.toHaveBeenCalled();
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

  describe('duplicate', () => {
    it("duplicates an exam's own settings, resetting status and scheduling regardless of source", async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: 'Answer all questions.',
            durationMinutes: 45,
            passCriteriaPercent: 60,
            randomizeOrder: true,
            feedbackVisibility: 'score',
            schedulingEnabled: true,
            availabilityWindowStart: new Date('2026-07-20T09:00:00.000Z'),
            availabilityWindowEnd: new Date('2026-07-27T18:00:00.000Z'),
            sections: [],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2', title: 'Backend Round (Copy)' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.duplicate(context, 'user-1', 'exam-1');

      expect(result).toEqual({ id: 'exam-2', title: 'Backend Round (Copy)' });
      expect(tx.exam.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          title: 'Backend Round (Copy)',
          instructions: 'Answer all questions.',
          durationMinutes: 45,
          passCriteriaPercent: 60,
          randomizeOrder: true,
          feedbackVisibility: 'score',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          createdBy: 'user-1',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'exam.duplicated',
        entityType: 'exam',
        entityId: 'exam-2',
        metadata: { sourceExamId: 'exam-1' },
      });
    });

    it('duplicates a fixed section and a pool section, re-linking the same questions and tags', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Mixed Round',
            instructions: null,
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            schedulingEnabled: false,
            availabilityWindowStart: null,
            availabilityWindowEnd: null,
            sections: [
              {
                id: 'section-1',
                title: 'Fixed Section',
                orderIndex: 0,
                selectionMode: 'fixed',
                poolSize: null,
                poolDifficulty: null,
                targetDurationMinutes: 15,
                questions: [
                  { questionId: 'q1', orderIndex: 0 },
                  { questionId: 'q2', orderIndex: 1 },
                ],
                poolTags: [],
              },
              {
                id: 'section-2',
                title: 'Pool Section',
                orderIndex: 1,
                selectionMode: 'pool',
                poolSize: 3,
                poolDifficulty: 'hard',
                targetDurationMinutes: null,
                questions: [],
                poolTags: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }],
              },
            ],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2', title: 'Mixed Round (Copy)' }),
        },
        examSection: {
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 'new-section-1' })
            .mockResolvedValueOnce({ id: 'new-section-2' }),
        },
        examSectionQuestion: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicate(context, 'user-1', 'exam-1');

      expect(tx.examSection.create).toHaveBeenNthCalledWith(1, {
        data: {
          examId: 'exam-2',
          title: 'Fixed Section',
          orderIndex: 0,
          selectionMode: 'fixed',
          poolSize: null,
          poolDifficulty: null,
          targetDurationMinutes: 15,
        },
      });
      expect(tx.examSection.create).toHaveBeenNthCalledWith(2, {
        data: {
          examId: 'exam-2',
          title: 'Pool Section',
          orderIndex: 1,
          selectionMode: 'pool',
          poolSize: 3,
          poolDifficulty: 'hard',
          targetDurationMinutes: null,
          poolTags: { create: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }] },
        },
      });
      expect(tx.examSectionQuestion.createMany).toHaveBeenCalledWith({
        data: [
          { sectionId: 'new-section-1', questionId: 'q1', orderIndex: 0 },
          { sectionId: 'new-section-1', questionId: 'q2', orderIndex: 1 },
        ],
      });
    });

    it('throws NotFoundException when duplicating an exam that does not exist', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.duplicate(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('getPendingGrading', () => {
    it("reports the candidate's chosen codeLanguage from the Answer row, not the Question", async () => {
      const attempt = {
        id: 'attempt-1',
        invitation: { candidateId: 'cand-1', candidate: { name: 'Ada' } },
        answers: [
          {
            questionId: 'q-1',
            answerText: 'print(1)',
            codeLanguage: 'python',
            marksAwarded: null,
            gradingFeedback: null,
            question: { type: 'code', text: 'x', starterCode: null, marks: 10 },
          },
        ],
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) }, attempt: { findMany: jest.fn().mockResolvedValue([attempt]) } }),
      );

      const result = await service.getPendingGrading(context, 'exam-1');

      expect(result[0].codeQuestions[0].codeLanguage).toBe('python');
    });
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
          proctoringAnalysis: null, integrityAnalysis: null, integrityLevel: null, integrityFlagCount: 0,
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
          proctoringAnalysis: null, integrityAnalysis: null, integrityLevel: null, integrityFlagCount: 0,
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
        include: { result: true, proctoringAnalysis: true, integrityAnalysis: true },
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

    it('includes the integrity analysis and a flattened level/flag count for a settled attempt, and null/0 when none exists yet', async () => {
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
                proctoringAnalysis: null,
                integrityAnalysis: {
                  status: 'flagged', level: 'high_risk',
                  flagsJson: JSON.stringify([{ type: 'tab_switch', severity: 'medium', detail: 'x' }, { type: 'copy_paste', severity: 'low', detail: 'y' }]),
                  narrative: 'Two flags raised.',
                },
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

      expect(result[0].integrityLevel).toBe('high_risk');
      expect(result[0].integrityFlagCount).toBe(2);
      expect(result[0].integrityAnalysis).toEqual({
        status: 'flagged', level: 'high_risk',
        flagsJson: JSON.stringify([{ type: 'tab_switch', severity: 'medium', detail: 'x' }, { type: 'copy_paste', severity: 'low', detail: 'y' }]),
        narrative: 'Two flags raised.',
      });
      expect(result[1].integrityAnalysis).toBeNull();
      expect(result[1].integrityLevel).toBeNull();
      expect(result[1].integrityFlagCount).toBe(0);
    });
  });

  describe('proctoring config', () => {
    it('persists all four proctoring fields on create, serialising disabled signals as JSON', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', {
        title: 'Screen',
        webcamProctoringEnabled: false,
        proctoringEnforcement: 'warn',
        proctoringStrikeLimit: 5,
        disabledProctoringSignals: ['right_click', 'idle_timeout'],
      });

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(['right_click', 'idle_timeout']),
          }),
        }),
      );
    });

    it('leaves the proctoring columns to their schema defaults when the caller omits them', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { title: 'Screen' });

      const data = tx.exam.create.mock.calls[0][0].data;
      expect(data.webcamProctoringEnabled).toBeUndefined();
      expect(data.proctoringEnforcement).toBeUndefined();
      expect(data.proctoringStrikeLimit).toBeUndefined();
      expect(data.disabledProctoringSignalsJson).toBeUndefined();
    });

    it('updates only the proctoring fields that were supplied', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'exam-1', { title: 'Screen', proctoringStrikeLimit: 2 });

      const data = tx.exam.update.mock.calls[0][0].data;
      expect(data.proctoringStrikeLimit).toBe(2);
      expect(data).not.toHaveProperty('webcamProctoringEnabled');
      expect(data).not.toHaveProperty('disabledProctoringSignalsJson');
    });

    it('clears the disabled-signal list when an empty array is supplied', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'exam-1', { title: 'Screen', disabledProctoringSignals: [] });

      expect(tx.exam.update.mock.calls[0][0].data.disabledProctoringSignalsJson).toBeNull();
    });

    it('rejects a proctoring-field update once a candidate has started an attempt', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }), update: jest.fn() },
        attempt: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(
        service.update(context, 'user-1', 'exam-1', { title: 'Exam', webcamProctoringEnabled: false }),
      ).rejects.toThrow(ConflictException);
      expect(tx.exam.update).not.toHaveBeenCalled();
    });

    it('allows a proctoring-field update before any candidate has started an attempt', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false }),
        },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'exam-1', { title: 'Exam', webcamProctoringEnabled: false });

      expect(tx.exam.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ webcamProctoringEnabled: false }) }),
      );
    });

    it('carries the proctoring config onto a duplicated exam', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Screen',
            instructions: null,
            durationMinutes: 45,
            passCriteriaPercent: 60,
            randomizeOrder: false,
            feedbackVisibility: 'score',
            schedulingEnabled: false,
            availabilityWindowStart: null,
            availabilityWindowEnd: null,
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(['right_click']),
            sections: [],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicate(context, 'user-1', 'exam-1');

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(['right_click']),
          }),
        }),
      );
    });
  });

  describe('anti-cheating master switch', () => {
    it('persists enableAntiCheating alongside the individual fields when on', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { title: 'Screen', enableAntiCheating: true, webcamProctoringEnabled: true });

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ enableAntiCheating: true, webcamProctoringEnabled: true }) }),
      );
    });

    it('forces webcam, screen capture, and lockdown off on create when the master switch is off, regardless of what else was submitted', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', {
        title: 'Screen',
        enableAntiCheating: false,
        webcamProctoringEnabled: true,
        screenCaptureEnabled: true,
        lockdownRequired: true,
        disabledProctoringSignals: [],
      });

      const data = tx.exam.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        enableAntiCheating: false,
        webcamProctoringEnabled: false,
        screenCaptureEnabled: false,
        lockdownRequired: false,
      });
      expect(JSON.parse(data.disabledProctoringSignalsJson)).toEqual(TOGGLEABLE_PROCTORING_SIGNALS);
    });

    it('forces every dependent field off on update too, even ones the caller did not touch this request', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false }),
        },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      // Note: only enableAntiCheating is submitted -- webcamProctoringEnabled etc. are
      // deliberately omitted, mirroring a UI that hides those fields once the master
      // switch is off and doesn't resubmit stale values for them.
      await service.update(context, 'user-1', 'exam-1', { title: 'Screen', enableAntiCheating: false });

      const data = tx.exam.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        enableAntiCheating: false,
        webcamProctoringEnabled: false,
        screenCaptureEnabled: false,
        lockdownRequired: false,
      });
    });

    it('leaves the individual proctoring fields to their own conditional updates when the master switch is on or omitted', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false }),
        },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'exam-1', { title: 'Screen', proctoringStrikeLimit: 2 });

      const data = tx.exam.update.mock.calls[0][0].data;
      expect(data.proctoringStrikeLimit).toBe(2);
      expect(data).not.toHaveProperty('enableAntiCheating');
      expect(data).not.toHaveProperty('webcamProctoringEnabled');
    });

    it('carries enableAntiCheating onto a duplicated exam', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Screen',
            instructions: null,
            durationMinutes: 45,
            passCriteriaPercent: 60,
            randomizeOrder: false,
            feedbackVisibility: 'score',
            schedulingEnabled: false,
            availabilityWindowStart: null,
            availabilityWindowEnd: null,
            enableAntiCheating: false,
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(TOGGLEABLE_PROCTORING_SIGNALS),
            sections: [],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicate(context, 'user-1', 'exam-1');

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ enableAntiCheating: false }) }),
      );
    });
  });

  describe('screen capture toggle', () => {
    it('persists screenCaptureEnabled on create', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { title: 'Screen', screenCaptureEnabled: true });

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenCaptureEnabled: true }) }),
      );
    });

    it('persists screenCaptureEnabled on update', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', schedulingEnabled: false, availabilityWindowStart: null, availabilityWindowEnd: null }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'user-1', 'exam-1', { title: 'Screen', screenCaptureEnabled: true });

      expect(tx.exam.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ screenCaptureEnabled: true }) }),
      );
    });

    it('leaves screenCaptureEnabled to the schema default when omitted', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { title: 'Screen' });

      expect(tx.exam.create.mock.calls[0][0].data.screenCaptureEnabled).toBeUndefined();
    });
  });
});
