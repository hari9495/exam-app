import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '@exam-platform/shared';
import { AccessService } from './access.service';

// Founder decision (8 Oct 2026): a company makes anyone a System Admin (users.role = org_admin) from Roles &
// access, and takes it away again, never leaving the company without one.
describe('AccessService.setSystemAdmin', () => {
  const ctx = { organizationId: 'org1', isSuperAdmin: false, userId: 'admin1' };
  const due = new Date(Date.now() + 7 * 86_400_000);
  let tx: Record<string, Record<string, jest.Mock> | jest.Mock>;
  let email: { send: jest.Mock };
  let service: AccessService;
  let recorded: jest.SpyInstance;

  const setup = (target: Record<string, unknown>, otherAdmins: number, previousRole?: string) => {
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === 'admin1' ? { name: 'Asha', email: 'asha@x.test' } : { id: 't1', name: 'Ravi', email: 'ravi@x.test', role: 'panel', status: 'active', permissionProfileId: null, mfaEnrolmentDueAt: due, ...target })),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(otherAdmins),
        findMany: jest.fn().mockResolvedValue([{ email: 'asha@x.test' }]),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { findFirst: jest.fn().mockResolvedValue(previousRole ? { metadataJson: JSON.stringify({ previousRole }) } : null) },
      organization: { findUnique: jest.fn().mockResolvedValue({ name: 'Kaveri Foods' }) },
    };
    const tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    service = new AccessService({} as never, tenantPrisma as never, {} as never, {} as never, email as never);
    recorded = jest.spyOn(AuditService, 'recordIn').mockResolvedValue(undefined);
  };
  const user = () => tx.user as Record<string, jest.Mock>;
  afterEach(() => jest.restoreAllMocks());

  it('makes a person a System Admin: role, two-step due now, sessions ended, audited with the reason, emails', async () => {
    setup({}, 1);
    const out = await service.setSystemAdmin(ctx, 'admin1', 't1', true, ' HR head ');
    expect(out.role).toBe('org_admin');
    const data = user().update.mock.calls[0][0].data;
    expect(data.role).toBe('org_admin');
    expect(data.mfaEnrolmentDueAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect((tx.session as Record<string, jest.Mock>).updateMany).toHaveBeenCalledWith({ where: { userId: 't1', revokedAt: null }, data: { revokedAt: expect.any(Date), revokedReason: 'privileges_changed' } });
    expect(recorded).toHaveBeenCalledWith(tx, expect.anything(), expect.objectContaining({ action: 'access.system_admin.granted', entityId: 't1', metadata: expect.objectContaining({ reason: 'HR head', previousRole: 'panel' }) }));
    expect(email.send.mock.calls.map((c) => c[0].to).sort()).toEqual(['asha@x.test', 'ravi@x.test']);
    expect(email.send.mock.calls.find((c) => c[0].to === 'ravi@x.test')[0].subject).toBe('You are now a System Admin in YukthiX');
  });

  it('removes it, back to the role recorded when they were made one', async () => {
    setup({ role: 'org_admin' }, 1, 'recruiter');
    const out = await service.setSystemAdmin(ctx, 'admin1', 't1', false, 'Moved on');
    expect(out.role).toBe('recruiter');
    expect(tx.$executeRaw).toHaveBeenCalled(); // the per-company lock
    expect(recorded).toHaveBeenCalledWith(tx, expect.anything(), expect.objectContaining({ action: 'access.system_admin.removed' }));
  });

  it('never removes the last active System Admin', async () => {
    setup({ role: 'org_admin' }, 0);
    await expect(service.setSystemAdmin(ctx, 'admin1', 't1', false, 'x')).rejects.toThrow(ConflictException);
    expect(user().update).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('refuses making yourself one, and repeating a change', async () => {
    setup({ id: 'admin1' }, 1);
    user().findFirst.mockResolvedValueOnce({ id: 'admin1', role: 'panel', status: 'active', mfaEnrolmentDueAt: due });
    await expect(service.setSystemAdmin(ctx, 'admin1', 'admin1', true, 'x')).rejects.toThrow(ForbiddenException);
    setup({ role: 'org_admin' }, 1);
    await expect(service.setSystemAdmin(ctx, 'admin1', 't1', true, 'x')).rejects.toThrow('already a System Admin');
  });
});
