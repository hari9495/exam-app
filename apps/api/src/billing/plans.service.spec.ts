import { PlansService } from './plans.service';

describe('PlansService', () => {
  const ctx = { organizationId: null, isSuperAdmin: true };
  let prisma: any; let audit: any; let service: PlansService;
  beforeEach(() => {
    prisma = { plan: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Trial' }]), create: jest.fn().mockResolvedValue({ id: 'p2' }), update: jest.fn().mockResolvedValue({ id: 'p1' }) },
               organization: { update: jest.fn().mockResolvedValue({ id: 'org-1', planId: 'p2' }) } };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PlansService(prisma, audit);
  });
  it('lists plans', async () => { expect(await service.list()).toHaveLength(1); });
  it('creates a plan', async () => {
    const out = await service.create(ctx as any, 'user-1', { name: 'Pro', seatLimit: 20, candidateLimit: 1000, aiCreditLimit: 500, proctoringMinutesLimit: 5000 } as any);
    expect(prisma.plan.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'plan.created' }));
    expect(out.id).toBe('p2');
  });
  it('assigns a plan to an org and audits org.plan_assigned', async () => {
    await service.assignToOrg(ctx as any, 'user-1', 'org-1', 'p2');
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { planId: 'p2' } });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'org.plan_assigned', entityId: 'org-1' }));
  });
});
