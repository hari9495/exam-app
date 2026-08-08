import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { BlobServiceClient, ContainerClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { AttemptsAdminService } from './attempts-admin.service';
import { TenantPrismaService, AuditService, BlobStorageService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';
import { BypassProctoringDto } from './dto/bypass-proctoring.dto';

// Only BlobServiceClient.fromConnectionString is faked below (real-BlobStorageService nested
// describe) -- ContainerClient/StorageSharedKeyCredential stay the real SDK classes, same
// pattern as packages/shared/src/storage/blob-storage.service.spec.ts.
jest.mock('@azure/storage-blob', () => {
  const actual = jest.requireActual('@azure/storage-blob');
  return { ...actual, BlobServiceClient: { fromConnectionString: jest.fn() } };
});

describe('AttemptsAdminService', () => {
  let service: AttemptsAdminService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let examRuntime: {
    forceSubmit: jest.Mock;
    unblock: jest.Mock;
    reanalyze: jest.Mock;
    notifyMessageSent: jest.Mock;
    regenerateInsight: jest.Mock;
    generateCodeReview: jest.Mock;
    applyProctoringBypass: jest.Mock;
    revokeProctoringBypass: jest.Mock;
  };
  let blobStorage: { signIfOurs: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    examRuntime = {
      forceSubmit: jest.fn(),
      unblock: jest.fn(),
      reanalyze: jest.fn(),
      notifyMessageSent: jest.fn(),
      regenerateInsight: jest.fn(),
      generateCodeReview: jest.fn(),
      applyProctoringBypass: jest.fn(),
      revokeProctoringBypass: jest.fn(),
    };
    // Identity pass-through by default -- signing behaviour itself is covered end to end below
    // and in packages/shared/src/storage/blob-storage.service.spec.ts.
    blobStorage = { signIfOurs: jest.fn(async (value) => value) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
        { provide: BlobStorageService, useValue: blobStorage },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });

  describe('listProctoringEvents', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listProctoringEvents(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the ordered proctoring events for an owned attempt, unchanged when there is no metadata', async () => {
      const events = [{ id: 'event-1', metadataJson: null }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listProctoringEvents(context, 'attempt-1');

      expect(tx.proctoringEvent.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' }, orderBy: { occurredAt: 'asc' } });
      expect(result).toEqual(events);
      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
    });

    it('signs an evidence URL inside metadataJson and re-serializes it back to a JSON string', async () => {
      const events = [{ id: 'event-1', metadataJson: JSON.stringify({ snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg', strike: 1 }) }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      blobStorage.signIfOurs.mockImplementation(async (value: string) => `${value}?sig=signed`);

      const [result] = await service.listProctoringEvents(context, 'attempt-1');

      expect(blobStorage.signIfOurs).toHaveBeenCalledWith('https://blob.test/container/webcam-snapshots/a.jpg');
      expect(JSON.parse(result.metadataJson as string)).toEqual({
        snapshot: 'https://blob.test/container/webcam-snapshots/a.jpg?sig=signed',
        strike: 1,
      });
    });

    it('leaves a data: URI in metadataJson identical after signing', async () => {
      const events = [{ id: 'event-1', metadataJson: JSON.stringify({ snapshot: 'data:image/jpeg;base64,AAAA' }) }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const [result] = await service.listProctoringEvents(context, 'attempt-1');

      expect(JSON.parse(result.metadataJson as string)).toEqual({ snapshot: 'data:image/jpeg;base64,AAAA' });
    });

    it('returns a row with malformed metadataJson unchanged instead of 500ing the whole list', async () => {
      const events = [{ id: 'event-1', metadataJson: '{not json' }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listProctoringEvents(context, 'attempt-1');

      expect(result).toEqual(events);
      expect(blobStorage.signIfOurs).not.toHaveBeenCalled();
    });

    describe('with the real BlobStorageService (offline SAS signing, no network)', () => {
      const CONTAINER_URL = 'https://fakeaccount.blob.core.windows.net/container';
      let realService: AttemptsAdminService;

      beforeEach(() => {
        const credential = new StorageSharedKeyCredential('fakeaccount', Buffer.from('fake-key').toString('base64'));
        const realContainer = new ContainerClient(CONTAINER_URL, credential);
        (BlobServiceClient.fromConnectionString as jest.Mock).mockReturnValue({
          getContainerClient: () => realContainer,
        });
        process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true';
        process.env.AZURE_STORAGE_CONTAINER = 'container';
        const realBlobStorage = new BlobStorageService();
        realService = new AttemptsAdminService(tenantPrisma as never, audit as never, examRuntime as never, realBlobStorage);
      });

      afterEach(() => {
        delete process.env.AZURE_STORAGE_CONNECTION_STRING;
        delete process.env.AZURE_STORAGE_CONTAINER;
      });

      it('resolves a raw blob URL to a genuinely signed SAS URL', async () => {
        const events = [{ id: 'event-1', metadataJson: JSON.stringify({ snapshot: `${CONTAINER_URL}/webcam-snapshots/a.jpg` }) }];
        const tx = {
          attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
          proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
        };
        tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

        const [result] = await realService.listProctoringEvents(context, 'attempt-1');
        const { snapshot } = JSON.parse(result.metadataJson as string);

        expect(snapshot.startsWith(`${CONTAINER_URL}/webcam-snapshots/a.jpg?`)).toBe(true);
        expect(new URLSearchParams(snapshot.split('?')[1]).get('sp')).toBe('r');
      });
    });
  });

  describe('forceSubmit', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.forceSubmit).not.toHaveBeenCalled();
    });

    it('delegates to the internal client and records an audit entry', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      examRuntime.forceSubmit.mockResolvedValue({ status: 'force_submitted' });

      const result = await service.forceSubmit(context, 'attempt-1', 'user-1');

      expect(examRuntime.forceSubmit).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.force_submit', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ status: 'force_submitted' });
    });
  });

  describe('unblock', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.unblock(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.unblock).not.toHaveBeenCalled();
    });

    it('looks up the attempt by id only (no organizationId filter) for a super_admin, whose context has organizationId: null', async () => {
      const superAdminContext = { organizationId: null, isSuperAdmin: true };
      const findFirst = jest.fn().mockResolvedValue({ id: 'attempt-1' });
      const tx = { attempt: { findFirst } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      examRuntime.unblock.mockResolvedValue({ status: 'in_progress' });

      await service.unblock(superAdminContext, 'attempt-1', 'user-1');

      expect(findFirst).toHaveBeenCalledWith({ where: { id: 'attempt-1' } });
      expect(examRuntime.unblock).toHaveBeenCalledWith('attempt-1');
    });

    it('proxies to examRuntime.unblock and records an audit entry', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      examRuntime.unblock.mockResolvedValue({ status: 'in_progress' });

      const result = await service.unblock(context, 'attempt-1', 'user-1');

      expect(examRuntime.unblock).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.unblock', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ status: 'in_progress' });
    });
  });

  describe('sendMessage', () => {
    it('throws NotFoundException without writing a message when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.sendMessage(context, 'attempt-1', 'user-1', 'hi')).rejects.toThrow(NotFoundException);
      expect(examRuntime.notifyMessageSent).not.toHaveBeenCalled();
    });

    it('writes the CandidateMessage row, notifies the internal client, and records an audit entry', async () => {
      const sentAt = new Date('2026-07-09T00:00:00.000Z');
      const created = { id: 'msg-1', attemptId: 'attempt-1', sentAt };
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1' }) },
        candidateMessage: { create: jest.fn().mockResolvedValue(created) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.sendMessage(context, 'attempt-1', 'user-1', 'Please stay on the exam tab');

      expect(tx.candidateMessage.create).toHaveBeenCalledWith({ data: { attemptId: 'attempt-1', sentByUserId: 'user-1', body: 'Please stay on the exam tab' } });
      expect(examRuntime.notifyMessageSent).toHaveBeenCalledWith({ examId: 'exam-1', attemptId: 'attempt-1', candidateId: 'cand-1', sentAt });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.message_sent', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toEqual({ id: 'msg-1', sentAt });
    });
  });

  describe('listMessages', () => {
    it('returns the ordered messages for an owned attempt', async () => {
      const messages = [{ id: 'msg-1' }];
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue(messages) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listMessages(context, 'attempt-1');

      expect(result).toBe(messages);
    });
  });

  describe('reanalyze', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.reanalyze(context, 'user-1', 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.reanalyze).not.toHaveBeenCalled();
    });

    it('triggers reanalysis via the internal client, then reads back the fresh ProctoringAnalysis row', async () => {
      const analysis = { attemptId: 'attempt-1', status: 'completed', riskLevel: 'high', summary: 'Copy-paste detected.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ proctoringAnalysis: { findUniqueOrThrow: jest.fn().mockResolvedValue(analysis) } });
      });

      const result = await service.reanalyze(context, 'user-1', 'attempt-1');

      expect(examRuntime.reanalyze).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.reanalyze_triggered', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toBe(analysis);
    });
  });

  describe('getInsight', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the attempt is owned but no insight has been generated yet', async () => {
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findFirst: jest.fn().mockResolvedValue(null) } });
      });

      await expect(service.getInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the AttemptInsight row for an owned attempt', async () => {
      const insight = { attemptId: 'attempt-1', status: 'completed', summary: 'Strong in SQL.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findFirst: jest.fn().mockResolvedValue(insight) } });
      });

      const result = await service.getInsight(context, 'attempt-1');

      expect(result).toBe(insight);
    });
  });

  describe('regenerateInsight', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.regenerateInsight(context, 'user-1', 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.regenerateInsight).not.toHaveBeenCalled();
    });

    it('triggers regeneration via the internal client, then reads back the fresh AttemptInsight row', async () => {
      const insight = { attemptId: 'attempt-1', status: 'completed', summary: 'Fresh summary.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findUniqueOrThrow: jest.fn().mockResolvedValue(insight) } });
      });

      const result = await service.regenerateInsight(context, 'user-1', 'attempt-1');

      expect(examRuntime.regenerateInsight).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'attempt.insight_regenerated', entityType: 'attempt', entityId: 'attempt-1',
      });
      expect(result).toBe(insight);
    });
  });

  describe('getCodeReview', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getCodeReview(context, 'attempt-1', 'question-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the attempt is owned but no code review has been generated yet', async () => {
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ codeAnswerReview: { findFirst: jest.fn().mockResolvedValue(null) } });
      });

      await expect(service.getCodeReview(context, 'attempt-1', 'question-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the CodeAnswerReview row for an owned attempt', async () => {
      const review = { answerId: 'answer-1', status: 'completed', suggestedMarks: 8, summary: 'Solid solution.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ codeAnswerReview: { findFirst: jest.fn().mockResolvedValue(review) } });
      });

      const result = await service.getCodeReview(context, 'attempt-1', 'question-1');

      expect(result).toBe(review);
    });
  });

  describe('regenerateCodeReview', () => {
    it('throws NotFoundException without calling the internal client when no answer is found', async () => {
      const tx = { answer: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.regenerateCodeReview(context, 'user-1', 'attempt-1', 'question-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.generateCodeReview).not.toHaveBeenCalled();
    });

    // The bug this pins: generateCodeReview() is fire-and-forget, so the review row is written
    // LATER by exam-runtime. Reading it back straight afterwards (findFirstOrThrow) lost the race
    // and 500'd -- the recruiter saw "Failed to generate AI review" while the review generated
    // fine in the background, and the rejected mutation never invalidated the query, so the card
    // never refetched. Claiming the row here first is what makes the poll start.
    it('claims the row as processing BEFORE triggering generation, so the read-back cannot race', async () => {
      const processing = { answerId: 'answer-1', status: 'processing', suggestedMarks: null, summary: null };
      const upsert = jest.fn().mockResolvedValue(processing);
      const order: string[] = [];
      upsert.mockImplementation(async () => {
        order.push('upsert');
        return processing;
      });
      (examRuntime.generateCodeReview as jest.Mock).mockImplementation(async () => {
        order.push('generate');
      });
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ answer: { findFirst: jest.fn().mockResolvedValue({ id: 'answer-1' }) } });
        }
        return fn({ codeAnswerReview: { upsert } });
      });

      const result = await service.regenerateCodeReview(context, 'user-1', 'attempt-1', 'question-1');

      expect(upsert).toHaveBeenCalledWith({
        where: { answerId: 'answer-1' },
        create: { answerId: 'answer-1', status: 'processing', suggestedMarks: null, summary: null },
        update: { status: 'processing', suggestedMarks: null, summary: null, generatedAt: expect.any(Date) },
      });
      // Ordering is the whole fix -- claiming after triggering would race exactly as before.
      expect(order).toEqual(['upsert', 'generate']);
      expect(examRuntime.generateCodeReview).toHaveBeenCalledWith('answer-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.code_review_regenerated',
        entityType: 'attempt',
        entityId: 'attempt-1',
        metadata: { questionId: 'question-1' },
      });
      // Returns the processing row, so the caller's poll has something to poll from.
      expect(result).toBe(processing);
    });
  });

  describe('proctoring bypass', () => {
    it('calls the runtime with the reason and actor, then audits', async () => {
      examRuntime.applyProctoringBypass = jest.fn().mockResolvedValue({ status: 'in_progress', proctoringBypassedAt: '2026-07-26T00:00:00.000Z' });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) } }),
      );

      const result = await service.bypassProctoring(context, 'a1', 'user-1', 'webcam driver crashing');

      expect(examRuntime.applyProctoringBypass).toHaveBeenCalledWith('a1', { reason: 'webcam driver crashing', actorUserId: 'user-1' });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.proctoring_bypassed',
        entityType: 'attempt',
        entityId: 'a1',
        metadata: { reason: 'webcam driver crashing' },
      });
      expect(result.status).toBe('in_progress');
    });

    it('trims leading/trailing whitespace from the reason before calling the runtime and auditing', async () => {
      examRuntime.applyProctoringBypass = jest.fn().mockResolvedValue({ status: 'in_progress', proctoringBypassedAt: null });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) } }),
      );

      await service.bypassProctoring(context, 'a1', 'user-1', '  webcam driver crashing  ');

      expect(examRuntime.applyProctoringBypass).toHaveBeenCalledWith('a1', { reason: 'webcam driver crashing', actorUserId: 'user-1' });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ metadata: { reason: 'webcam driver crashing' } }));
    });

    it('audits the revoke with its own action name', async () => {
      examRuntime.revokeProctoringBypass = jest.fn().mockResolvedValue({ status: 'in_progress', proctoringBypassedAt: null });
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) } }),
      );

      await service.revokeProctoringBypass(context, 'a1', 'user-1');

      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.proctoring_bypass_revoked',
        entityType: 'attempt',
        entityId: 'a1',
      });
    });

    it('refuses an attempt outside the caller organization', async () => {
      examRuntime.applyProctoringBypass = jest.fn();
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ attempt: { findFirst: jest.fn().mockResolvedValue(null) } }),
      );

      await expect(service.bypassProctoring(context, 'a1', 'user-1', 'nope')).rejects.toThrow(NotFoundException);
      expect(examRuntime.applyProctoringBypass).not.toHaveBeenCalled();
    });

    it('refuses to revoke an attempt outside the caller organization', async () => {
      // Revoke resets both violation counters and resumes the attempt, so a missing
      // ownership check here would be the more dangerous of the pair.
      examRuntime.revokeProctoringBypass = jest.fn();
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
        fn({ attempt: { findFirst: jest.fn().mockResolvedValue(null) } }),
      );

      await expect(service.revokeProctoringBypass(context, 'a1', 'user-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.revokeProctoringBypass).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('BypassProctoringDto validation', () => {
    it('rejects a whitespace-only reason', async () => {
      const dto = new BypassProctoringDto();
      dto.reason = '   ';

      const errors = await validate(dto);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts a genuine reason', async () => {
      const dto = new BypassProctoringDto();
      dto.reason = 'webcam driver crashing';

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
