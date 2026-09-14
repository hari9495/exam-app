import { NotFoundException } from '@nestjs/common';
import { ResultReleaseService } from './result-release.service';

describe('ResultReleaseService', () => {
  let tx: any;
  let tenantPrisma: any;
  let audit: { record: jest.Mock };
  let email: { send: jest.Mock };
  let blob: { signIfOurs: jest.Mock };
  let service: ResultReleaseService;
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      result: {
        findMany: jest.fn().mockResolvedValue([{ id: 'r1', attemptId: 'a1' }, { id: 'r2', attemptId: 'a2' }]),
        updateMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue({ id: 'r1' }),
        update: jest.fn(),
      },
      attempt: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            result: { passFail: 'pass', percentage: 88 },
            invitation: { candidate: { email: 'c@x.com', name: 'Cass', emailOptedOutAt: null }, exam: { title: 'Algorithms', feedbackVisibility: 'score' } },
          },
        ]),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Acme', logoPath: null }) },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(tx)) };
    audit = { record: jest.fn() };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    blob = { signIfOurs: jest.fn(async (v: unknown) => v) };
    service = new ResultReleaseService(tenantPrisma, audit as any, email as any, blob as any);
  });

  describe('releaseExam', () => {
    it('releases all not-yet-released results and audits the count', async () => {
      const res = await service.releaseExam(context, 'u1', 'exam-1', false);
      expect(res).toEqual({ released: 2 });
      expect(tx.result.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['r1', 'r2'] } }, data: expect.objectContaining({ releaseOverride: 'released' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'results.released', metadata: { released: 2 } }));
      expect(email.send).not.toHaveBeenCalled(); // notify=false
    });

    it('throws when the exam is not in the org', async () => {
      tx.exam.findFirst.mockResolvedValue(null);
      await expect(service.releaseExam(context, 'u1', 'exam-x', false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setAttemptRelease', () => {
    it('releases one attempt, audits, and emails when notify is set', async () => {
      const res = await service.setAttemptRelease(context, 'u1', 'a1', 'released', true);
      expect(res).toEqual({ status: 'released' });
      expect(tx.result.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ releaseOverride: 'released' }) }),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'result.released' }));
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'c@x.com', subject: 'Your results for Algorithms' }));
    });

    it('holds an attempt without emailing', async () => {
      const res = await service.setAttemptRelease(context, 'u1', 'a1', 'held', false);
      expect(res).toEqual({ status: 'held' });
      expect(tx.result.update).toHaveBeenCalledWith(expect.objectContaining({ data: { releaseOverride: 'held' } }));
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'result.held' }));
      expect(email.send).not.toHaveBeenCalled();
    });

    it('throws when the attempt has no settled result in the org', async () => {
      tx.result.findFirst.mockResolvedValue(null);
      await expect(service.setAttemptRelease(context, 'u1', 'a9', 'released', false)).rejects.toThrow(NotFoundException);
    });

    it('skips the notify email for an opted-out candidate', async () => {
      tx.attempt.findMany.mockResolvedValue([
        { id: 'a1', result: { passFail: 'pass', percentage: 88 }, invitation: { candidate: { email: 'c@x.com', name: 'Cass', emailOptedOutAt: new Date() }, exam: { title: 'Algorithms', feedbackVisibility: 'score' } } },
      ]);
      await service.setAttemptRelease(context, 'u1', 'a1', 'released', true);
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
