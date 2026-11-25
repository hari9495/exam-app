import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { resolveSteps } from './approver-resolver';

jest.mock('./approver-resolver', () => ({ resolveSteps: jest.fn() }));

const mockResolveSteps = resolveSteps as jest.Mock;

describe('ApprovalsService.getGateStatus', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  it('returns the enabled flag for each gate that has a chain row', async () => {
    const tx = {
      approvalChain: {
        findMany: jest.fn().mockResolvedValue([
          { gate: 'requisition', enabled: true },
          { gate: 'offer', enabled: false },
        ]),
      },
    };
    const tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    const service = new ApprovalsService(tenantPrisma as any, {} as any, {} as any);

    const result = await service.getGateStatus(context);

    expect(tx.approvalChain.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { gate: true, enabled: true },
    });
    expect(result).toEqual({ requisition: true, offer: false });
  });

  it('defaults a gate to false when no chain row exists for it', async () => {
    const tx = { approvalChain: { findMany: jest.fn().mockResolvedValue([]) } };
    const tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    const service = new ApprovalsService(tenantPrisma as any, {} as any, {} as any);

    const result = await service.getGateStatus(context);

    expect(result).toEqual({ requisition: false, offer: false });
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

describe('ApprovalsService.upsertChain / getChains', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  const groupStepDto = (overrides: Record<string, unknown> = {}) => ({
    name: 'Group approval',
    approverType: 'group',
    groupId: 'group-1',
    ...overrides,
  });

  const makeTx = (overrides: Record<string, unknown> = {}) => ({
    approvalChain: { upsert: jest.fn().mockResolvedValue({ id: 'chain-1' }) },
    approvalChainStep: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}), findMany: jest.fn() },
    userGroupMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]) },
    ...overrides,
  });

  const makeService = (tx: Record<string, unknown>) => {
    const tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    return new ApprovalsService(tenantPrisma as any, {} as any, {} as any);
  };

  it('rejects an enabled chain with a group step whose group has 0 active members', async () => {
    const tx = makeTx({ userGroupMember: { findMany: jest.fn().mockResolvedValue([]) } });
    const service = makeService(tx);

    await expect(service.upsertChain(context, 'requisition', { enabled: true, steps: [groupStepDto()] } as any)).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.approvalChainStep.createMany).not.toHaveBeenCalled();
  });

  it('rejects an enabled chain with a group step whose group members are all inactive', async () => {
    const tx = makeTx({
      userGroupMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]) },
      user: { findMany: jest.fn().mockResolvedValue([]) }, // neither u1 nor u2 is active
    });
    const service = makeService(tx);

    await expect(service.upsertChain(context, 'requisition', { enabled: true, steps: [groupStepDto()] } as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts an enabled chain with a group step that has at least one active member, persisting groupId', async () => {
    const tx = makeTx();
    const service = makeService(tx);

    const result = await service.upsertChain(context, 'requisition', { enabled: true, steps: [groupStepDto()] } as any);

    expect(tx.userGroupMember.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', groupId: 'group-1' },
      select: { userId: true },
    });
    expect(tx.approvalChainStep.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ chainId: 'chain-1', position: 0, groupId: 'group-1' })],
    });
    expect(result.steps[0]).toEqual(expect.objectContaining({ approverType: 'group' }));
  });

  it('a group step missing groupId is rejected even when the chain is disabled', async () => {
    const tx = makeTx();
    const service = makeService(tx);

    await expect(
      service.upsertChain(context, 'requisition', { enabled: false, steps: [groupStepDto({ groupId: undefined })] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(tx.approvalChainStep.createMany).not.toHaveBeenCalled();
  });

  it('a group step missing groupId is rejected on a disabled chain without checking membership', async () => {
    const tx = makeTx();
    const service = makeService(tx);

    await expect(
      service.upsertChain(context, 'requisition', { enabled: false, steps: [groupStepDto({ groupId: undefined })] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(tx.userGroupMember.findMany).not.toHaveBeenCalled();
  });

  it('persists groupId as null for non-group steps, and clears it when a step switches from group to users', async () => {
    const tx = makeTx();
    const service = makeService(tx);

    await service.upsertChain(context, 'requisition', {
      enabled: true,
      steps: [{ name: 'Manager sign-off', approverType: 'users', approverUserIds: ['mgr-1'] }],
    } as any);

    expect(tx.approvalChainStep.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ approverType: 'users', groupId: null })],
    });
    expect(tx.userGroupMember.findMany).not.toHaveBeenCalled();
  });

  it('getChains round-trips groupId: present on a group step, null on other steps', async () => {
    const tx = {
      approvalChain: {
        findMany: jest.fn().mockResolvedValue([
          {
            gate: 'requisition',
            enabled: true,
            steps: [
              { position: 0, name: 'Group approval', approverType: 'group', approverUserIds: null, groupId: 'group-1', managerLevel: null },
              { position: 1, name: 'Manager sign-off', approverType: 'users', approverUserIds: '["mgr-1"]', groupId: null, managerLevel: null },
            ],
          },
        ]),
      },
    };
    const tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    const service = new ApprovalsService(tenantPrisma as any, {} as any, {} as any);

    const result = await service.getChains(context);

    expect(result.requisition.steps[0]).toEqual(expect.objectContaining({ approverType: 'group', groupId: 'group-1' }));
    expect(result.requisition.steps[1]).toEqual(expect.objectContaining({ approverType: 'users', groupId: null }));
  });
});
