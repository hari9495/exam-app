import { Test } from '@nestjs/testing';
import { AuditQueryService } from './audit-query.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('AuditQueryService', () => {
  let service: AuditQueryService;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditQueryService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(AuditQueryService);
  });

  it('scopes org_admin queries to their own organization', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { findMany } }));

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
  });

  it('does not filter by organizationId for super_admin, relying on RLS for cross-org visibility', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { findMany } }));

    await service.list({ organizationId: null, isSuperAdmin: true }, {});

    const call = findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBeUndefined();
  });

  it('applies entityType, actorUserId, action, and date-range filters', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { findMany } }));

    await service.list(
      { organizationId: 'org-1', isSuperAdmin: false },
      { entityType: 'exam', actorUserId: 'user-1', action: 'exam.published', from: '2026-01-01', to: '2026-01-31' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          entityType: 'exam',
          actorUserId: 'user-1',
          action: 'exam.published',
          createdAt: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        }),
      }),
    );
  });

  it('maps rows to the response shape, including actor email and parsed metadata', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'log-1',
        action: 'exam.published',
        entityType: 'exam',
        entityId: 'exam-1',
        actorUserId: 'user-1',
        actor: { email: 'admin@demo-org.test' },
        metadataJson: JSON.stringify({ foo: 'bar' }),
        createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      {
        id: 'log-2',
        action: 'attempt.settled',
        entityType: 'attempt',
        entityId: 'attempt-1',
        actorUserId: null,
        actor: null,
        metadataJson: null,
        createdAt: new Date('2026-01-16T00:00:00.000Z'),
      },
    ]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { findMany } }));

    const result = await service.list({ organizationId: 'org-1', isSuperAdmin: false }, {});

    expect(result).toEqual([
      {
        id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1',
        actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', metadata: { foo: 'bar' },
        createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      {
        id: 'log-2', action: 'attempt.settled', entityType: 'attempt', entityId: 'attempt-1',
        actorUserId: null, actorEmail: null, metadata: null,
        createdAt: new Date('2026-01-16T00:00:00.000Z'),
      },
    ]);
  });

  it('defaults limit to 20 and clamps an out-of-range limit', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { findMany } }));

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { limit: 500 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });
});
