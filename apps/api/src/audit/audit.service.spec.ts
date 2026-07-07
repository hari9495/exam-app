import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_ctx, fn) => fn({ auditLog: { create: jest.fn() } })) };
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
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { create } }));

    await service.record(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'login.success', entityType: 'user', entityId: 'user-1', metadata: { ip: '127.0.0.1' } },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadataJson: JSON.stringify({ ip: '127.0.0.1' }) }),
    });
  });
});
