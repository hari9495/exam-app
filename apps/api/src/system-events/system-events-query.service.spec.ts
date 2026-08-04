import { Test } from '@nestjs/testing';
import { TenantPrismaService } from '@exam-platform/shared';
import { SystemEventsQueryService } from './system-events-query.service';

describe('SystemEventsQueryService', () => {
  let service: SystemEventsQueryService;
  let tenantPrisma: { forTenant: jest.Mock };
  let findMany: jest.Mock;
  let count: jest.Mock;

  const tenant = { organizationId: 'org-1', isSuperAdmin: false };
  const row = {
    id: 'evt-1',
    organizationId: 'org-1',
    service: 'candidate-browser',
    severity: 'error',
    message: 'js_error: boom',
    contextJson: JSON.stringify({ attemptId: 'attempt-1', kind: 'js_error' }),
    occurredAt: new Date('2026-08-03T10:00:00.000Z'),
  };

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([row]);
    count = jest.fn().mockResolvedValue(1);
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_ctx, fn) => fn({ systemEvent: { findMany, count } })) };
    const moduleRef = await Test.createTestingModule({
      providers: [SystemEventsQueryService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(SystemEventsQueryService);
  });

  it('lists events newest-first with parsed context, scoped to the tenant', async () => {
    const entries = await service.list(tenant, {});

    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(tenant, expect.any(Function));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { occurredAt: 'desc' }, take: 50 }));
    expect(entries).toEqual([
      expect.objectContaining({
        id: 'evt-1',
        service: 'candidate-browser',
        context: { attemptId: 'attempt-1', kind: 'js_error' },
        occurredAt: '2026-08-03T10:00:00.000Z',
      }),
    ]);
  });

  it('filters by service, severity, time range, and attemptId (contains match on context)', async () => {
    await service.list(tenant, {
      service: 'api',
      severity: 'error',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-03T00:00:00.000Z',
      attemptId: 'attempt-1',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          service: 'api',
          severity: 'error',
          contextJson: { contains: 'attempt-1' },
          occurredAt: { gte: new Date('2026-08-01T00:00:00.000Z'), lte: new Date('2026-08-03T00:00:00.000Z') },
        },
      }),
    );
  });

  it('caps the page size at 200', async () => {
    await service.list(tenant, { limit: 5000 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });

  it('returns null context when contextJson is malformed instead of failing the page', async () => {
    findMany.mockResolvedValue([{ ...row, contextJson: 'not-json{' }]);
    const entries = await service.list(tenant, {});
    expect(entries[0].context).toBeNull();
  });

  it('counts with the same filters', async () => {
    await service.count(tenant, { severity: 'warn' });
    expect(count).toHaveBeenCalledWith({ where: { severity: 'warn' } });
  });
});
