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
    expect(notifications.notify).toHaveBeenCalledWith(
      context,
      'user-1',
      ['user-1', 'admin-1'],
      'approval.step_skipped',
      expect.objectContaining({ entityType: 'job', entityId: 'job-1' }),
    );
  });
});
