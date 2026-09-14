// Stub BullMQ so constructing the service does not open a real Redis connection (the Worker is
// created in the constructor; these tests exercise run() directly).
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

import { ConflictException } from '@nestjs/common';
import { CandidateEmailBatchWorkerService, CandidateEmailBatchJobData } from './candidate-email-batch.worker.service';

describe('CandidateEmailBatchWorkerService.run', () => {
  let txStub: any;
  let tenantPrisma: any;
  let candidateEmails: { sendMessage: jest.Mock };

  beforeEach(() => {
    txStub = { candidateEmailBatch: { update: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: any) => fn(txStub)) };
    candidateEmails = { sendMessage: jest.fn() };
  });

  function svc() {
    return new CandidateEmailBatchWorkerService({} as any, tenantPrisma, candidateEmails as any);
  }

  const baseJob: Omit<CandidateEmailBatchJobData, 'entryIds'> = {
    batchId: 'b1',
    organizationId: 'org-1',
    actorUserId: 'u1',
    templateId: null,
    subject: 'Hi',
    body: 'Body',
  };

  it('tallies sent / skipped (opt-out) / failed and completes the batch', async () => {
    candidateEmails.sendMessage
      .mockResolvedValueOnce({ status: 'sent' }) // e1 sent
      .mockRejectedValueOnce(new ConflictException('unsubscribed')) // e2 opted out -> skipped
      .mockResolvedValueOnce({ status: 'failed' }) // e3 SMTP failed -> failed
      .mockRejectedValueOnce(new Error('boom')); // e4 other error -> failed

    const tally = await svc().run({ ...baseJob, entryIds: ['e1', 'e2', 'e3', 'e4'] });

    expect(tally).toEqual({ sent: 1, skipped: 1, failed: 2 });
    // sendMessage always called with source 'manual'.
    expect(candidateEmails.sendMessage).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      'u1',
      'e1',
      expect.objectContaining({ source: 'manual', subject: 'Hi', body: 'Body' }),
    );
    // First status write is 'processing', last is 'completed' with the final tally.
    const calls = txStub.candidateEmailBatch.update.mock.calls;
    expect(calls[0][0].data.status).toBe('processing');
    expect(calls[calls.length - 1][0].data).toEqual(
      expect.objectContaining({ status: 'completed', sent: 1, skipped: 1, failed: 2 }),
    );
  });

  it('treats a null return (triggered-skip path) as skipped', async () => {
    candidateEmails.sendMessage.mockResolvedValueOnce(null);
    const tally = await svc().run({ ...baseJob, entryIds: ['e1'] });
    expect(tally).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('passes senderAddressId through when set', async () => {
    candidateEmails.sendMessage.mockResolvedValue({ status: 'sent' });
    await svc().run({ ...baseJob, entryIds: ['e1'], senderAddressId: 's1' });
    expect(candidateEmails.sendMessage).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      'e1',
      expect.objectContaining({ senderAddressId: 's1' }),
    );
  });
});
