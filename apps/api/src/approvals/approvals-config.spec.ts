import { BadRequestException } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';

describe('ApprovalsService.getChains / upsertChain', () => {
  let service: ApprovalsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let tx: {
    approvalChain: { findMany: jest.Mock; upsert: jest.Mock };
    approvalChainStep: { deleteMany: jest.Mock; createMany: jest.Mock };
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      approvalChain: {
        findMany: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'chain-1', organizationId: 'org-1', gate: 'requisition', enabled: true }),
      },
      approvalChainStep: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    service = new ApprovalsService(tenantPrisma as any, { record: jest.fn() } as any, { notify: jest.fn() } as any);
  });

  describe('getChains', () => {
    it('returns a default disabled/empty shape for a gate with no row, without persisting it', async () => {
      tx.approvalChain.findMany.mockResolvedValue([]);

      const result = await service.getChains(context);

      expect(result).toEqual({
        requisition: { gate: 'requisition', enabled: false, steps: [] },
        offer: { gate: 'offer', enabled: false, steps: [] },
      });
      expect(tx.approvalChain.upsert).not.toHaveBeenCalled();
    });

    it('maps an existing row (with steps, JSON-parsing approverUserIds) into a ChainDto', async () => {
      tx.approvalChain.findMany.mockResolvedValue([
        {
          gate: 'requisition',
          enabled: true,
          steps: [
            { position: 0, name: 'Manager', approverType: 'users', approverUserIds: '["u1","u2"]', managerLevel: null },
          ],
        },
      ]);

      const result = await service.getChains(context);

      expect(result.requisition).toEqual({
        gate: 'requisition',
        enabled: true,
        steps: [{ position: 0, name: 'Manager', approverType: 'users', approverUserIds: ['u1', 'u2'], managerLevel: null }],
      });
      expect(result.offer).toEqual({ gate: 'offer', enabled: false, steps: [] });
    });
  });

  describe('upsertChain', () => {
    it('rejects an enabled users step with no approverUserIds', async () => {
      await expect(
        service.upsertChain(context, 'requisition', {
          enabled: true,
          steps: [{ name: 'Sign-off', approverType: 'users', approverUserIds: [] }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(tx.approvalChain.upsert).not.toHaveBeenCalled();
    });

    it('rejects an enabled users step with absent approverUserIds', async () => {
      await expect(
        service.upsertChain(context, 'requisition', {
          enabled: true,
          steps: [{ name: 'Sign-off', approverType: 'users' }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('defaults a missing managerLevel to 1 for a reporting_manager step instead of rejecting', async () => {
      const result = await service.upsertChain(context, 'requisition', {
        enabled: true,
        steps: [{ name: 'Manager', approverType: 'reporting_manager' }],
      } as any);

      expect(result.steps[0].managerLevel).toBe(1);
      expect(tx.approvalChainStep.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ managerLevel: 1, position: 0 })],
      });
    });

    it('allows enabled with zero steps (auto-pass escape hatch)', async () => {
      const result = await service.upsertChain(context, 'requisition', { enabled: true, steps: [] } as any);

      expect(result).toEqual({ gate: 'requisition', enabled: true, steps: [] });
      expect(tx.approvalChain.upsert).toHaveBeenCalled();
      expect(tx.approvalChainStep.createMany).not.toHaveBeenCalled();
    });

    it('normalizes positions to a contiguous 0..n on save regardless of input order', async () => {
      const result = await service.upsertChain(context, 'requisition', {
        enabled: false,
        steps: [
          { name: 'Step A', approverType: 'hiring_manager' },
          { name: 'Step B', approverType: 'hiring_manager' },
          { name: 'Step C', approverType: 'hiring_manager' },
        ],
      } as any);

      expect(result.steps.map((s) => s.position)).toEqual([0, 1, 2]);
      expect(tx.approvalChainStep.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ position: 0, name: 'Step A' }),
          expect.objectContaining({ position: 1, name: 'Step B' }),
          expect.objectContaining({ position: 2, name: 'Step C' }),
        ],
      });
    });

    it('deletes existing steps for the chain before creating the new set (replace semantics)', async () => {
      await service.upsertChain(context, 'offer', {
        enabled: true,
        steps: [{ name: 'Step A', approverType: 'users', approverUserIds: ['u1'] }],
      } as any);

      expect(tx.approvalChainStep.deleteMany).toHaveBeenCalledWith({ where: { chainId: 'chain-1' } });
      // deleteMany must happen before createMany (replace, not append)
      const deleteOrder = tx.approvalChainStep.deleteMany.mock.invocationCallOrder[0];
      const createOrder = tx.approvalChainStep.createMany.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(createOrder);
    });

    it('serializes approverUserIds to a JSON string column', async () => {
      await service.upsertChain(context, 'offer', {
        enabled: true,
        steps: [{ name: 'Step A', approverType: 'users', approverUserIds: ['u1', 'u2'] }],
      } as any);

      expect(tx.approvalChainStep.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ approverUserIds: JSON.stringify(['u1', 'u2']) })],
      });
    });

    it('upserts the ApprovalChain by organizationId_gate with the enabled flag', async () => {
      await service.upsertChain(context, 'offer', { enabled: false, steps: [] } as any);

      expect(tx.approvalChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_gate: { organizationId: 'org-1', gate: 'offer' } },
          update: { enabled: false },
          create: expect.objectContaining({ organizationId: 'org-1', gate: 'offer', enabled: false }),
        }),
      );
    });
  });
});
