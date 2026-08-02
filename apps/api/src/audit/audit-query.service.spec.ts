import { Test } from '@nestjs/testing';
import { AuditQueryService } from './audit-query.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('AuditQueryService', () => {
  let service: AuditQueryService;
  let tenantPrisma: { forTenant: jest.Mock };

  // Mock transaction client. resolveEntityNames() reaches for exam/candidate/
  // user/organization delegates, so they must exist even when a test returns no
  // rows (in which case they simply aren't called).
  function mockTx(auditRows: unknown[], overrides: Record<string, unknown> = {}) {
    return {
      auditLog: { findMany: jest.fn().mockResolvedValue(auditRows), count: jest.fn().mockResolvedValue(auditRows.length) },
      exam: { findMany: jest.fn().mockResolvedValue([]) },
      candidate: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      organization: { findMany: jest.fn().mockResolvedValue([]) },
      question: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditQueryService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(AuditQueryService);
  });

  it('scopes org_admin queries to their own organization', async () => {
    const tx = mockTx([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, {});

    expect(tx.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
    );
  });

  it('does not filter by organizationId for super_admin, relying on RLS for cross-org visibility', async () => {
    const tx = mockTx([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.list({ organizationId: null, isSuperAdmin: true }, {});

    const call = tx.auditLog.findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBeUndefined();
  });

  it('applies entityType, actorUserId, action, and date-range filters', async () => {
    const tx = mockTx([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.list(
      { organizationId: 'org-1', isSuperAdmin: false },
      { entityType: 'exam', actorUserId: 'user-1', action: 'exam.published', from: '2026-01-01', to: '2026-01-31' },
    );

    expect(tx.auditLog.findMany).toHaveBeenCalledWith(
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

  it('maps rows to the response shape, resolving actor identity and entity name', async () => {
    const rows = [
      {
        id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1', actorUserId: 'user-1',
        actorEmail: null, actorName: null, actorRole: null,
        actor: { email: 'admin@demo-org.test', name: 'Demo Admin', role: 'org_admin' },
        metadataJson: JSON.stringify({ foo: 'bar' }), createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      {
        id: 'log-2', action: 'attempt.settled', entityType: 'attempt', entityId: 'attempt-1', actorUserId: null,
        actorEmail: null, actorName: null, actorRole: null, actor: null,
        metadataJson: null, createdAt: new Date('2026-01-16T00:00:00.000Z'),
      },
    ];
    const tx = mockTx(rows, { exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round' }]) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list({ organizationId: 'org-1', isSuperAdmin: false }, {});

    expect(result).toEqual([
      {
        id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1', entityName: 'Backend Round',
        actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', actorName: 'Demo Admin', actorRole: 'org_admin',
        metadata: { foo: 'bar' }, createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
      {
        id: 'log-2', action: 'attempt.settled', entityType: 'attempt', entityId: 'attempt-1', entityName: null,
        actorUserId: null, actorEmail: null, actorName: null, actorRole: null,
        metadata: null, createdAt: new Date('2026-01-16T00:00:00.000Z'),
      },
    ]);
  });

  it('prefers the write-time actor snapshot over the live join', async () => {
    const rows = [
      {
        id: 'log-1', action: 'super_admin.org_switch_in', entityType: 'organization', entityId: 'org-9', actorUserId: 'sa-1',
        // Snapshot captured at write time; the live join is null because RLS hides the super-admin's out-of-org row.
        actorEmail: 'boss@platform.test', actorName: 'Big Boss', actorRole: 'super_admin', actor: null,
        metadataJson: null, createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    ];
    const tx = mockTx(rows, { organization: { findMany: jest.fn().mockResolvedValue([{ id: 'org-9', name: 'Acme Corp' }]) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const [entry] = await service.list({ organizationId: 'org-9', isSuperAdmin: false }, {});

    expect(entry.actorEmail).toBe('boss@platform.test');
    expect(entry.actorName).toBe('Big Boss');
    expect(entry.actorRole).toBe('super_admin');
    expect(entry.entityName).toBe('Acme Corp');
  });

  it('defaults limit to 20 and clamps an out-of-range limit', async () => {
    const tx = mockTx([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { limit: 500 });

    expect(tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });

  it('filters by entityId, for a per-entity history view', async () => {
    const tx = mockTx([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { entityType: 'exam', entityId: 'exam-1' });

    expect(tx.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entityType: 'exam', entityId: 'exam-1' }) }),
    );
  });

  it("resolves a question entity's name to its (truncated) question text", async () => {
    const longText = 'a'.repeat(80);
    const rows = [
      {
        id: 'log-1', action: 'question.updated', entityType: 'question', entityId: 'q-1', actorUserId: 'user-1',
        actorEmail: null, actorName: null, actorRole: null, actor: null,
        metadataJson: null, createdAt: new Date('2026-01-15T00:00:00.000Z'),
      },
    ];
    const tx = mockTx(rows, { question: { findMany: jest.fn().mockResolvedValue([{ id: 'q-1', text: longText }]) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const [entry] = await service.list({ organizationId: 'org-1', isSuperAdmin: false }, {});

    expect(entry.entityName).toBe(`${'a'.repeat(60)}…`);
  });

  describe('category filter (access vs change)', () => {
    it("filters to only access events (view/session activity) when category is 'access'", async () => {
      const tx = mockTx([]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { category: 'access' });

      const call = tx.auditLog.findMany.mock.calls[0][0];
      expect(call.where.action).toEqual({ in: expect.arrayContaining(['super_admin.org_switch_in', 'login.success']) });
    });

    it("excludes access events when category is 'change'", async () => {
      const tx = mockTx([]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { category: 'change' });

      const call = tx.auditLog.findMany.mock.calls[0][0];
      expect(call.where.action).toEqual({ notIn: expect.arrayContaining(['super_admin.org_switch_in', 'login.success']) });
    });

    it("applies no action filter when category is 'all' or omitted", async () => {
      const tx = mockTx([]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.list({ organizationId: 'org-1', isSuperAdmin: false }, { category: 'all' });

      const call = tx.auditLog.findMany.mock.calls[0][0];
      expect(call.where.action).toBeUndefined();
    });
  });

  describe('count', () => {
    it('counts the full filtered set using the same where-clause as list()', async () => {
      const tx = mockTx([]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const total = await service.count(
        { organizationId: 'org-1', isSuperAdmin: false },
        { entityType: 'exam', category: 'change' },
      );

      expect(total).toBe(0);
      expect(tx.auditLog.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ organizationId: 'org-1', entityType: 'exam', action: { notIn: expect.any(Array) } }),
      });
    });
  });

  describe('listForExport', () => {
    it('returns every matching row up to the export cap, ignoring pagination', async () => {
      const rows = [
        {
          id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1', actorUserId: 'user-1',
          actorEmail: 'a@b.test', actorName: 'A B', actorRole: 'recruiter', actor: null,
          metadataJson: null, createdAt: new Date('2026-01-15T00:00:00.000Z'),
        },
      ];
      const tx = mockTx(rows);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listForExport({ organizationId: 'org-1', isSuperAdmin: false }, {});

      expect(result).toHaveLength(1);
      expect(tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5000 }));
      expect(tx.auditLog.findMany.mock.calls[0][0]).not.toHaveProperty('cursor');
    });
  });
});
