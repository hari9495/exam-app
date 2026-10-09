import { displayName, EmployeeHistoryService, redactImpact } from './employee-history.service';

// Unit-level guards of the history service; the flows are proven end to end in test/employee-history.e2e-spec.ts.
describe('EmployeeHistoryService helpers', () => {
  it('R1: an impact handed to someone without pay access carries no amounts, also for rebased changes', () => {
    const impact = { facts: [{ fact: 'Grade', from: 'G2', to: 'G3' }], pay: [{ fact: 'Annual CTC', from: 'INR 1', to: 'INR 2' }], rebased: [{ changeId: 'c', facts: [], pay: [{ fact: 'Annual CTC', from: 'INR 2', to: 'INR 3' }] }], retro: null };
    expect(redactImpact(impact)).toEqual({ facts: impact.facts, pay: 'hidden', rebased: [{ changeId: 'c', facts: [], pay: 'hidden' }], retro: null });
    expect(redactImpact({ facts: [], pay: [], rebased: [] })).toEqual({ facts: [], pay: [], rebased: [] });
  });

  it('shows the preferred name, else given and family names', () => {
    expect(displayName({ givenName: 'Arjun', familyName: 'Kulkarni', preferredName: null })).toBe('Arjun Kulkarni');
    expect(displayName({ givenName: 'Lakshmi', familyName: null, preferredName: 'Lux' })).toBe('Lux');
  });

  it('impersonation and YukthiX staff in a company act for someone else: no pay, no own record (P02 YX-SEC-20)', async () => {
    const tenantPrisma = { forTenant: jest.fn() };
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'employee.salary.view' } }]) } };
    const service = new EmployeeHistoryService(prisma as never, tenantPrisma as never);
    const v = await service.viewer({ userId: 'u', role: 'org_admin', organizationId: null, impersonatorUserId: 'staff' });
    expect(v).toMatchObject({ userId: 'u', actingForOther: true });
    expect(v.grants.has('employee.salary.view')).toBe(true);
    expect((await service.viewer({ userId: 'u', role: 'org_admin', organizationId: null })).actingForOther).toBe(false);
  });
});
