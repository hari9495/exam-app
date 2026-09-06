import { BadRequestException, ConflictException } from '@nestjs/common';
import { PipelinesService } from './pipelines.service';

describe('PipelinesService guardrails', () => {
  let service: PipelinesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let tx: {
    pipeline: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; delete: jest.Mock };
    pipelineStage: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    pipelineStatus: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
    pipelineEntry: { count: jest.Mock };
  };
  const context = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(() => {
    tx = {
      pipeline: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
      pipelineStage: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      pipelineStatus: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      pipelineEntry: { count: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_c, fn) => fn(tx)) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PipelinesService(tenantPrisma as any, audit as any);
  });

  it('refuses to delete the default pipeline', async () => {
    tx.pipeline.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'org-1', isDefault: true });

    await expect(service.deletePipeline(context, 'u1', 'p1')).rejects.toThrow(/default/i);
    expect(tx.pipeline.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a stage that still has entries', async () => {
    tx.pipelineStage.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1', pipelineId: 'p1', category: 'active' });
    tx.pipelineEntry.count.mockResolvedValue(3);

    await expect(service.deleteStage(context, 'u1', 's1')).rejects.toThrow(/entr/i);
    await expect(service.deleteStage(context, 'u1', 's1')).rejects.toThrow(ConflictException);
    expect(tx.pipelineStage.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete the last hired-category stage', async () => {
    tx.pipelineStage.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1', pipelineId: 'p1', category: 'hired' });
    tx.pipelineEntry.count.mockResolvedValue(0);
    tx.pipelineStage.findMany.mockResolvedValue([{ id: 's2', category: 'active' }]);

    await expect(service.deleteStage(context, 'u1', 's1')).rejects.toThrow(/hired/i);
    await expect(service.deleteStage(context, 'u1', 's1')).rejects.toThrow(BadRequestException);
    expect(tx.pipelineStage.delete).not.toHaveBeenCalled();
  });

  it('allows deleting a hired-category stage when a sibling shares the category', async () => {
    tx.pipelineStage.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1', pipelineId: 'p1', category: 'hired' });
    tx.pipelineEntry.count.mockResolvedValue(0);
    tx.pipelineStage.findMany.mockResolvedValue([{ id: 's2', category: 'hired' }]);
    tx.pipelineStage.delete.mockResolvedValue({ id: 's1' });

    await service.deleteStage(context, 'u1', 's1');

    expect(tx.pipelineStage.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'pipeline.stage_deleted', entityId: 's1' }));
  });

  it('rejects an invalid category on createStage', async () => {
    await expect(service.createStage(context, 'u1', 'p1', { name: 'X', category: 'bogus' as any, position: 0 })).rejects.toThrow(/category/i);
    await expect(service.createStage(context, 'u1', 'p1', { name: 'X', category: 'bogus' as any, position: 0 })).rejects.toThrow(BadRequestException);
    expect(tx.pipelineStage.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid category on updateStage', async () => {
    await expect(service.updateStage(context, 'u1', 's1', { category: 'bogus' as any })).rejects.toThrow(BadRequestException);
    expect(tx.pipelineStage.update).not.toHaveBeenCalled();
  });

  it('updateStage persists valid rules as serialized rulesJson and returns parsed rules (rulesJson omitted)', async () => {
    const rules = [{ id: 'r1', type: 'feedback', minCount: 2 }];
    tx.pipelineStage.findFirst.mockResolvedValue({ id: 's1', organizationId: 'org-1' });
    tx.pipelineStage.update.mockResolvedValue({ id: 's1', name: 'X', rulesJson: JSON.stringify(rules) });

    const result = await service.updateStage(context, 'u1', 's1', { rules } as any);

    expect(tx.pipelineStage.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { rulesJson: JSON.stringify(rules) },
    });
    expect(result).toEqual({ id: 's1', name: 'X', rules });
    expect(result).not.toHaveProperty('rulesJson');
  });

  it('updateStage rejects an invalid rule shape without touching the DB', async () => {
    await expect(service.updateStage(context, 'u1', 's1', { rules: [{ type: 'bogus' }] } as any)).rejects.toThrow(BadRequestException);
    expect(tx.pipelineStage.update).not.toHaveBeenCalled();
  });

  it('listPipelines maps rulesJson to parsed rules per stage (null rulesJson -> rules: [])', async () => {
    const rules = [{ id: 'r1', type: 'checklist', items: [{ id: 'i1', label: 'Signed NDA' }] }];
    tx.pipeline.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Default',
        stages: [
          { id: 's1', name: 'Applied', rulesJson: null, statuses: [] },
          { id: 's2', name: 'Interview', rulesJson: JSON.stringify(rules), statuses: [] },
        ],
      },
    ]);

    const result = await service.listPipelines(context);

    expect(result[0].stages[0]).toEqual({ id: 's1', name: 'Applied', statuses: [], rules: [] });
    expect(result[0].stages[0]).not.toHaveProperty('rulesJson');
    expect(result[0].stages[1]).toEqual({ id: 's2', name: 'Interview', statuses: [], rules });
    expect(result[0].stages[1]).not.toHaveProperty('rulesJson');
  });

  it('refuses to delete a status that still has entries', async () => {
    tx.pipelineStatus.findFirst.mockResolvedValue({ id: 'st1', organizationId: 'org-1', stageId: 's1' });
    tx.pipelineEntry.count.mockResolvedValue(2);

    await expect(service.deleteStatus(context, 'u1', 'st1')).rejects.toThrow(ConflictException);
    expect(tx.pipelineStatus.delete).not.toHaveBeenCalled();
  });

  it('resolveStatus returns null when not found', async () => {
    tx.pipelineStatus.findFirst.mockResolvedValue(null);

    const result = await service.resolveStatus(context, 'missing');

    expect(result).toBeNull();
  });

  it('resolveStatus returns status + stage when found', async () => {
    tx.pipelineStatus.findFirst.mockResolvedValue({ id: 'st1', name: 'Phone Screen', stageId: 's1', stage: { id: 's1', category: 'active' } });

    const result = await service.resolveStatus(context, 'st1');

    expect(result).toEqual({ status: { id: 'st1', name: 'Phone Screen', stageId: 's1' }, stage: { id: 's1', category: 'active' } });
  });

  it('createPipeline deep-copies the default pipeline stages+statuses', async () => {
    tx.pipeline.create.mockResolvedValue({ id: 'p2', organizationId: 'org-1', name: 'New', isDefault: false });
    tx.pipeline.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-1',
      isDefault: true,
      stages: [
        { id: 'ds1', name: 'Applied', category: 'active', position: 0, statuses: [{ id: 'dst1', name: 'Screening', position: 0 }] },
        { id: 'ds2', name: 'Hired', category: 'hired', position: 1, statuses: [] },
      ],
    });
    tx.pipelineStage.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `new-${data.position}`, ...data }));

    const result = await service.createPipeline(context, 'u1', { name: 'New' });

    expect(result).toEqual({ id: 'p2', organizationId: 'org-1', name: 'New', isDefault: false });
    expect(tx.pipelineStage.create).toHaveBeenCalledTimes(2);
    expect(tx.pipelineStatus.create).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'pipeline.created', entityId: 'p2' }));
  });
});
