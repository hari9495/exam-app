import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { resolveSteps } from './approver-resolver';

jest.mock('./approver-resolver', () => ({ resolveSteps: jest.fn() }));

const mockResolveSteps = resolveSteps as jest.Mock;

describe('ApprovalsService.submit', () => {
  let service: ApprovalsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let notifications: { notify: jest.Mock };
  let tx: {
    approvalChain: { findUnique: jest.Mock };
    approvalRequest: { create: jest.Mock };
    $queryRaw: jest.Mock;
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      approvalChain: { findUnique: jest.fn() },
      approvalRequest: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'req-1', ...data })),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    mockResolveSteps.mockReset();
    service = new ApprovalsService(tenantPrisma as any, audit as any, notifications as any);
  });

  it('returns approved when the gate chain is disabled', async () => {
    tx.approvalChain.findUnique.mockResolvedValue({ enabled: false, steps: [] });

    const result = await service.submit(context, 'requisition', 'job-1', 'user-1');

    expect(result).toEqual({ status: 'approved' });
    expect(tx.approvalRequest.create).not.toHaveBeenCalled();
    expect(mockResolveSteps).not.toHaveBeenCalled();
  });

  it('returns approved when no chain exists for the gate', async () => {
    tx.approvalChain.findUnique.mockResolvedValue(null);

    const result = await service.submit(context, 'offer', 'offer-1', 'user-1');

    expect(result).toEqual({ status: 'approved' });
    expect(tx.approvalRequest.create).not.toHaveBeenCalled();
  });

  it('auto-passes (approved) + audits when the resolved chain has zero steps', async () => {
    tx.approvalChain.findUnique.mockResolvedValue({ enabled: true, steps: [] });
    mockResolveSteps.mockResolvedValue({ resolved: [], skipped: [] });

    const result = await service.submit(context, 'requisition', 'job-1', 'user-1');

    expect(result).toEqual({ status: 'approved' });
    expect(tx.approvalRequest.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'approval.auto_passed', entityType: 'job', entityId: 'job-1' }));
  });

  it('creates a pending request at step 0, freezes the snapshot, and notifies step-0 approvers', async () => {
    const step = { position: 0, name: 'Manager sign-off', approverType: 'users', approverUserIds: ['mgr-1', 'mgr-2'] };
    tx.approvalChain.findUnique.mockResolvedValue({
      enabled: true,
      steps: [{ position: 0, name: 'Manager sign-off', approverType: 'users', approverUserIds: '["mgr-1","mgr-2"]', managerLevel: null }],
    });
    mockResolveSteps.mockResolvedValue({ resolved: [step], skipped: [] });

    const result = await service.submit(context, 'requisition', 'job-1', 'user-1');

    expect(result).toEqual({ status: 'pending_approval', requestId: 'req-1' });
    expect(tx.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        gate: 'requisition',
        subjectType: 'job',
        subjectId: 'job-1',
        status: 'pending_approval',
        currentStepPosition: 0,
        submittedByUserId: 'user-1',
        chainSnapshotJson: JSON.stringify([step]),
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'approval.submitted' }));
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'user-1',
      ['mgr-1', 'mgr-2'],
      'approval.requested',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1', linkPath: '/v2/approvals/req-1' }),
    );
  });

  it('notifies submitter+admins about skipped dynamic steps', async () => {
    const step = { position: 0, name: 'Manager sign-off', approverType: 'users', approverUserIds: ['mgr-1'] };
    tx.approvalChain.findUnique.mockResolvedValue({
      enabled: true,
      steps: [{ position: 0, name: 'Manager sign-off', approverType: 'users', approverUserIds: '["mgr-1"]', managerLevel: null }],
    });
    mockResolveSteps.mockResolvedValue({
      resolved: [step],
      skipped: [{ position: 1, reason: 'No approver resolved for step "Hiring manager" (hiring_manager)' }],
    });

    await service.submit(context, 'requisition', 'job-1', 'user-1');

    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'approval.step_skipped' }));
    expect(tx.$queryRaw).toHaveBeenCalled();

    const skippedCall = notifications.notify.mock.calls.find((call: unknown[]) => call[3] === 'approval.step_skipped');
    expect(skippedCall).toBeDefined();
    const [, actorArg, recipientsArg, , target] = skippedCall as [unknown, string, string[], string, Record<string, unknown>];
    expect(target).toEqual(expect.objectContaining({ entityType: 'job', entityId: 'job-1' }));

    // Regression for the bug where the submitter never received this notification:
    // NotificationsService.notify unconditionally drops the actor from its own recipient list
    // (`ids.filter(id => id !== actorUserId)`). Passing the submitter as the actor here means
    // the submitter self-filters out and only admins are notified -- replicate that exact
    // filter against what was actually passed, and prove the submitter survives it.
    expect(actorArg).not.toBe('user-1');
    const survivingRecipients = [...new Set(recipientsArg)].filter((id) => id && id !== actorArg);
    expect(survivingRecipients).toContain('user-1');
    expect(survivingRecipients).toContain('admin-1');
  });
});

describe('ApprovalsService.decide', () => {
  let service: ApprovalsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let notifications: { notify: jest.Mock };
  let tx: {
    approvalRequest: { findFirst: jest.Mock; updateMany: jest.Mock };
    approvalDecision: { create: jest.Mock };
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  const twoStepReq = (overrides: Record<string, unknown> = {}) => ({
    id: 'req-1',
    organizationId: 'org-1',
    gate: 'requisition',
    subjectType: 'job',
    subjectId: 'job-1',
    status: 'pending_approval',
    currentStepPosition: 0,
    submittedByUserId: 'submitter-1',
    chainSnapshotJson: JSON.stringify([
      { position: 0, name: 'Step 1', approverType: 'users', approverUserIds: ['mgr-1'] },
      { position: 1, name: 'Step 2', approverType: 'users', approverUserIds: ['mgr-2'] },
    ]),
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      approvalRequest: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      approvalDecision: { create: jest.fn().mockResolvedValue({}) },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new ApprovalsService(tenantPrisma as any, audit as any, notifications as any);
  });

  it('advances to the next step when a non-final step is approved', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

    const result = await service.decide(context, 'req-1', 'mgr-1', 'approved');

    expect(result).toEqual({ requestStatus: 'pending_approval', subjectResolved: false, subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
    expect(tx.approvalDecision.create).toHaveBeenCalledWith({
      data: { requestId: 'req-1', stepPosition: 0, approverUserId: 'mgr-1', decision: 'approved', note: null },
    });
    expect(tx.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'pending_approval', currentStepPosition: 0 },
      data: { currentStepPosition: 1 },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'mgr-1',
      ['mgr-2'],
      'approval.requested',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1', linkPath: '/v2/approvals/req-1' }),
    );
  });

  it('marks the request approved + subjectResolved on final-step approval', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq({ currentStepPosition: 1 }));

    const result = await service.decide(context, 'req-1', 'mgr-2', 'approved');

    expect(result).toEqual({ requestStatus: 'approved', subjectResolved: true, subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
    expect(tx.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'pending_approval', currentStepPosition: 1 },
      data: { status: 'approved', decidedAt: expect.any(Date) },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'mgr-2',
      ['submitter-1'],
      'approval.approved',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1' }),
    );
  });

  it('marks rejected + subjectResolved on reject, storing the note', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

    const result = await service.decide(context, 'req-1', 'mgr-1', 'rejected', 'not a fit');

    expect(result).toEqual({ requestStatus: 'rejected', subjectResolved: true, subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
    expect(tx.approvalDecision.create).toHaveBeenCalledWith({
      data: { requestId: 'req-1', stepPosition: 0, approverUserId: 'mgr-1', decision: 'rejected', note: 'not a fit' },
    });
    expect(tx.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'pending_approval', currentStepPosition: 0 },
      data: { status: 'rejected', decidedAt: expect.any(Date) },
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'mgr-1',
      ['submitter-1'],
      'approval.rejected',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1' }),
    );
  });

  it('throws 403 when actor is not in the current step approvers', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

    await expect(service.decide(context, 'req-1', 'not-an-approver', 'approved')).rejects.toThrow(ForbiddenException);
    expect(tx.approvalDecision.create).not.toHaveBeenCalled();
    expect(tx.approvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('the conditional update makes a second concurrent decide a no-op (409)', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());
    tx.approvalRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.decide(context, 'req-1', 'mgr-1', 'approved')).rejects.toThrow(ConflictException);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

describe('ApprovalsService.cancel', () => {
  let service: ApprovalsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let notifications: { notify: jest.Mock };
  let tx: {
    approvalRequest: { findFirst: jest.Mock; updateMany: jest.Mock };
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  const twoStepReq = (overrides: Record<string, unknown> = {}) => ({
    id: 'req-1',
    organizationId: 'org-1',
    gate: 'requisition',
    subjectType: 'job',
    subjectId: 'job-1',
    status: 'pending_approval',
    currentStepPosition: 0,
    submittedByUserId: 'submitter-1',
    chainSnapshotJson: JSON.stringify([
      { position: 0, name: 'Step 1', approverType: 'users', approverUserIds: ['mgr-1'] },
      { position: 1, name: 'Step 2', approverType: 'users', approverUserIds: ['mgr-2'] },
    ]),
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      approvalRequest: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    service = new ApprovalsService(tenantPrisma as any, audit as any, notifications as any);
  });

  it('lets the submitter cancel their own request', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

    const result = await service.cancel(context, 'req-1', 'submitter-1', false);

    expect(result).toEqual({ subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
    expect(tx.approvalRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'pending_approval' },
      data: { status: 'cancelled', decidedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'approval.cancelled', entityType: 'job', entityId: 'job-1' }));
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'submitter-1',
      ['mgr-1'],
      'approval.cancelled',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1' }),
    );
  });

  it('lets an approvals:configure holder cancel someone else\'s request', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

    const result = await service.cancel(context, 'req-1', 'admin-1', true);

    expect(result).toEqual({ subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'admin-1',
      ['mgr-1'],
      'approval.cancelled',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1' }),
    );
  });

  it('throws 403 when a non-submitter, non-configurer tries to cancel', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

    await expect(service.cancel(context, 'req-1', 'random-user', false)).rejects.toThrow(ForbiddenException);
    expect(tx.approvalRequest.updateMany).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('throws 409 when the request is not open for approval', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq({ status: 'approved' }));

    await expect(service.cancel(context, 'req-1', 'submitter-1', false)).rejects.toThrow(ConflictException);
    expect(tx.approvalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('throws 409 when not found', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(null);

    await expect(service.cancel(context, 'req-1', 'submitter-1', false)).rejects.toThrow(ConflictException);
  });

  it('the conditional update makes a second concurrent cancel a no-op (409)', async () => {
    tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());
    tx.approvalRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel(context, 'req-1', 'submitter-1', false)).rejects.toThrow(ConflictException);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  describe('cancelForSubject', () => {
    it('finds the open request for the subject and delegates to cancel', async () => {
      tx.approvalRequest.findFirst.mockResolvedValue(twoStepReq());

      const result = await service.cancelForSubject(context, 'job', 'job-1', 'submitter-1', false);

      expect(result).toEqual({ subjectType: 'job', subjectId: 'job-1', gate: 'requisition' });
      // First lookup (by subject) is a status:pending_approval scan; cancel()'s own lookup is by id.
      expect(tx.approvalRequest.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', subjectType: 'job', subjectId: 'job-1', status: 'pending_approval' },
      });
      expect(tx.approvalRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-1', status: 'pending_approval' },
        data: { status: 'cancelled', decidedAt: expect.any(Date) },
      });
    });

    it('throws 409 when there is no open request for the subject', async () => {
      tx.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(service.cancelForSubject(context, 'job', 'job-1', 'submitter-1', false)).rejects.toThrow(ConflictException);
      expect(tx.approvalRequest.updateMany).not.toHaveBeenCalled();
    });
  });
});

describe('ApprovalsService.isConfigurer', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  it('returns true when the user id is among the approvals:configure holders', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]) };
    const tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    const service = new ApprovalsService(tenantPrisma as any, {} as any, {} as any);

    await expect(service.isConfigurer(context, 'admin-2')).resolves.toBe(true);
    await expect(service.isConfigurer(context, 'nobody')).resolves.toBe(false);
  });
});
