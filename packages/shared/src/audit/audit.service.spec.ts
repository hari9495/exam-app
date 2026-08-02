import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let tenantPrisma: { forTenant: jest.Mock };

  function mockTx(overrides: Record<string, unknown> = {}) {
    return {
      auditLog: { create: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      ...overrides,
    };
  }

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_ctx, fn) => fn(mockTx())) };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('records an audit entry scoped to the tenant context', async () => {
    await service.record(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'user.created', entityType: 'user', entityId: 'user-2' },
    );

    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, expect.any(Function));
  });

  it('serializes metadata to a JSON string', async () => {
    const create = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx({ auditLog: { create } })));

    await service.record(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'login.success', entityType: 'user', entityId: 'user-1', metadata: { ip: '127.0.0.1' } },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadataJson: JSON.stringify({ ip: '127.0.0.1' }) }),
    });
  });

  it('snapshots the actor identity (email/name/role) looked up at write time', async () => {
    const create = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({ email: 'boss@platform.test', name: 'Big Boss', role: 'super_admin' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx({ auditLog: { create }, user: { findUnique } })));

    await service.record(
      { organizationId: 'org-1', isSuperAdmin: true },
      { actorUserId: 'sa-1', action: 'super_admin.org_switch_in', entityType: 'organization', entityId: 'org-1' },
    );

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'sa-1' }, select: { email: true, name: true, role: true } });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorEmail: 'boss@platform.test', actorName: 'Big Boss', actorRole: 'super_admin' }),
    });
  });

  it('still records the entry when the actor identity cannot be looked up', async () => {
    const create = jest.fn();
    const findUnique = jest.fn().mockRejectedValue(new Error('rls hid the row'));
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx({ auditLog: { create }, user: { findUnique } })));

    await service.record(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'ghost', action: 'user.updated', entityType: 'user', entityId: 'user-2' },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorEmail: null, actorName: null, actorRole: null }),
    });
  });
});
