import { DripService } from './drip.service';

// tenantPrisma.forTenant(ctx, fn) just runs fn against a shared per-test tx mock.
function makeService(tx: Record<string, any>, candidateEmails: { sendMessage: jest.Mock }) {
  const tenantPrisma = { forTenant: jest.fn((_ctx: unknown, fn: (t: unknown) => unknown) => fn(tx)) } as any;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as any;
  return new DripService(tenantPrisma, candidateEmails as any, audit);
}

const ctx = { organizationId: 'o1', isSuperAdmin: false } as any;
const steps2 = JSON.stringify([{ subject: 'S1', body: 'B1', delayDays: 0 }, { subject: 'S2', body: 'B2', delayDays: 3 }]);
const steps1 = JSON.stringify([{ subject: 'S1', body: 'B1', delayDays: 0 }]);

describe('DripService.sweep / processEnrolment', () => {
  const due = [{ id: 'e1', organizationId: 'o1', campaignId: 'c1', entryId: 'en1', currentStepIndex: 0 }];

  it('sends the current step and advances to the next when more steps remain', async () => {
    const tx = {
      dripEnrolment: { findMany: jest.fn().mockResolvedValue(due), update: jest.fn().mockResolvedValue({}) },
      dripCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', enabled: true, stepsJson: steps2 }) },
    };
    const candidateEmails = { sendMessage: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    await makeService(tx, candidateEmails).sweep(new Date('2026-09-15T00:00:00Z'));

    expect(candidateEmails.sendMessage).toHaveBeenCalledWith(
      { organizationId: 'o1', isSuperAdmin: false }, null, 'en1',
      { subject: 'S1', body: 'B1', source: 'drip' },
    );
    expect(tx.dripEnrolment.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'e1' },
      data: expect.objectContaining({ currentStepIndex: 1, nextStepDueAt: new Date('2026-09-18T00:00:00Z') }),
    }));
  });

  it('completes the enrolment after sending the last step', async () => {
    const tx = {
      dripEnrolment: { findMany: jest.fn().mockResolvedValue(due), update: jest.fn().mockResolvedValue({}) },
      dripCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', enabled: true, stepsJson: steps1 }) },
    };
    const candidateEmails = { sendMessage: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    await makeService(tx, candidateEmails).sweep();
    expect(tx.dripEnrolment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }));
  });

  it('exits the enrolment when the candidate has opted out (send returns null)', async () => {
    const tx = {
      dripEnrolment: { findMany: jest.fn().mockResolvedValue(due), update: jest.fn().mockResolvedValue({}) },
      dripCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', enabled: true, stepsJson: steps2 }) },
    };
    const candidateEmails = { sendMessage: jest.fn().mockResolvedValue(null) };
    await makeService(tx, candidateEmails).sweep();
    expect(tx.dripEnrolment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'exited', exitReason: 'unsubscribed' }) }));
  });

  it('exits the enrolment when the send throws (e.g. erased candidate)', async () => {
    const tx = {
      dripEnrolment: { findMany: jest.fn().mockResolvedValue(due), update: jest.fn().mockResolvedValue({}) },
      dripCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', enabled: true, stepsJson: steps2 }) },
    };
    const candidateEmails = { sendMessage: jest.fn().mockRejectedValue(new Error('Candidate has been erased')) };
    await makeService(tx, candidateEmails).sweep();
    expect(tx.dripEnrolment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'exited', exitReason: 'send_failed' }) }));
  });

  it('defers (does not send) when the campaign is disabled', async () => {
    const tx = {
      dripEnrolment: { findMany: jest.fn().mockResolvedValue(due), update: jest.fn().mockResolvedValue({}) },
      dripCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', enabled: false, stepsJson: steps2 }) },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    await makeService(tx, candidateEmails).sweep();
    expect(candidateEmails.sendMessage).not.toHaveBeenCalled();
    expect(tx.dripEnrolment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ nextStepDueAt: expect.any(Date) }) }));
  });
});

describe('DripService.enrolCandidates', () => {
  it('resolves candidate→latest entry, skips already-enrolled and no-entry candidates', async () => {
    const tx = {
      dripCampaign: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', stepsJson: steps1 }) },
      pipelineEntry: { findMany: jest.fn().mockResolvedValue([{ id: 'en-a', candidateId: 'a' }, { id: 'en-b', candidateId: 'b' }]) },
      dripEnrolment: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'b' }]), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    const result = await makeService(tx, candidateEmails).enrolCandidates(ctx, 'user-1', 'c1', { candidateIds: ['a', 'b', 'c'] });

    // a -> enrol; b -> already enrolled; c -> no entry
    expect(result).toEqual({ enrolled: 1, alreadyEnrolled: 1, noEntry: 1 });
    expect(tx.dripEnrolment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ campaignId: 'c1', candidateId: 'a', entryId: 'en-a', organizationId: 'o1' })],
    });
  });
});

describe('DripService.enrolOnStageChange', () => {
  it('auto-enrols the candidate into enabled campaigns matching their new global stage', async () => {
    const tx = {
      pipelineEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1', candidate: { globalStage: 'available' } }) },
      dripCampaign: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', stepsJson: steps1 }]) },
      dripEnrolment: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    await makeService(tx, candidateEmails).enrolOnStageChange(ctx, 'en1');

    expect(tx.dripCampaign.findMany).toHaveBeenCalledWith({ where: { enabled: true, targetGlobalStage: 'available' } });
    expect(tx.dripEnrolment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ campaignId: 'c1', candidateId: 'cand-1', entryId: 'en1' })],
    });
  });

  it('does nothing when the candidate has no matching enabled campaign', async () => {
    const tx = {
      pipelineEntry: { findUnique: jest.fn().mockResolvedValue({ id: 'en1', candidateId: 'cand-1', candidate: { globalStage: 'new' } }) },
      dripCampaign: { findMany: jest.fn().mockResolvedValue([]) },
      dripEnrolment: { findMany: jest.fn(), createMany: jest.fn() },
    };
    const candidateEmails = { sendMessage: jest.fn() };
    await makeService(tx, candidateEmails).enrolOnStageChange(ctx, 'en1');
    expect(tx.dripEnrolment.createMany).not.toHaveBeenCalled();
  });
});
