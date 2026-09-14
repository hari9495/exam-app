import { BadRequestException } from '@nestjs/common';
import { BulkCandidateEmailService } from './bulk-candidate-email.service';

describe('BulkCandidateEmailService', () => {
  let txStub: any;
  let tenantPrisma: any;
  let audit: { record: jest.Mock };
  let queue: { add: jest.Mock };
  let service: BulkCandidateEmailService;
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    txStub = {
      pipelineEntry: { findMany: jest.fn() },
      candidateEmailBatch: { create: jest.fn().mockResolvedValue({ id: 'batch-1' }), findFirst: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(txStub)) };
    audit = { record: jest.fn() };
    queue = { add: jest.fn() };
    service = new BulkCandidateEmailService(tenantPrisma, audit as any, queue as any);
  });

  const compose = { subject: 'Hello', body: 'Body {{candidateName}}', templateId: null };

  describe('sendToEntries', () => {
    it('creates a batch, enqueues the job with the entry ids, and audits', async () => {
      const result = await service.sendToEntries(context, 'u1', ['e1', 'e2'], compose);

      expect(result).toEqual({ batchId: 'batch-1', total: 2, unresolvedCandidateIds: [] });
      expect(txStub.candidateEmailBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-1', total: 2, subject: 'Hello', createdByUserId: 'u1' }) }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({ batchId: 'batch-1', organizationId: 'org-1', entryIds: ['e1', 'e2'], subject: 'Hello' }),
        expect.anything(),
      );
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'candidate_email_batch.enqueued', entityId: 'batch-1' }));
    });

    it('rejects an empty entry list before touching the queue', async () => {
      await expect(service.sendToEntries(context, 'u1', [], compose)).rejects.toThrow(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('sendToCandidates', () => {
    it('resolves each candidate to their latest entry and reports the unresolved ones', async () => {
      // findMany returns rows already ordered createdAt desc; first-seen per candidate = latest.
      txStub.pipelineEntry.findMany.mockResolvedValue([
        { id: 'e1-latest', candidateId: 'c1' },
        { id: 'e1-older', candidateId: 'c1' },
        { id: 'e2', candidateId: 'c2' },
      ]); // c3 has no entry

      const result = await service.sendToCandidates(context, 'u1', ['c1', 'c2', 'c3'], compose);

      expect(result).toEqual({ batchId: 'batch-1', total: 2, unresolvedCandidateIds: ['c3'] });
      expect(queue.add).toHaveBeenCalledWith(
        'send',
        expect.objectContaining({ entryIds: ['e1-latest', 'e2'] }),
        expect.anything(),
      );
    });

    it('rejects when no candidate resolves to an entry', async () => {
      txStub.pipelineEntry.findMany.mockResolvedValue([]);
      await expect(service.sendToCandidates(context, 'u1', ['c1'], compose)).rejects.toThrow(BadRequestException);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
