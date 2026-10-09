import { resolvePermissionGrants, resolveScopedGrants } from './permission-grants';
import { grantScopesFor } from '../record-visibility/record-visibility';
import { CONFIDENTIAL_KEYS, EMPLOYEE_FIELD_CLASSES, holdsConfidential, maskTail } from '../field-permissions/employee-fields';

// P02 §3 / YX-SEC-03: rights are the union of the base role (company-wide) and the active role grants, each
// with its scope; a key in a grant narrower than its module supports confers nothing.
describe('resolveScopedGrants (P02 YX-SEC-03)', () => {
  const build = (grants: { scope_type: string; target: string | null; permissions_json: string }[], base: string[] = ['org:view']) => {
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue(base.map((key) => ({ permission: { key } }))) } };
    const tx = { orgRolePermission: { findUnique: jest.fn().mockResolvedValue(null) }, $queryRaw: jest.fn().mockResolvedValue(grants) };
    const tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    return { prisma: prisma as never, tenantPrisma: tenantPrisma as never, tx };
  };

  it('base keys are company-wide; grants add their scope; duplicates collapse', async () => {
    const { prisma, tenantPrisma } = build([
      { scope_type: 'legal_entity', target: 'e1', permissions_json: '["employee.profile.view","employee.salary.view"]' },
      { scope_type: 'legal_entity', target: 'e1', permissions_json: '["employee.profile.view"]' },
      { scope_type: 'location', target: 'l1', permissions_json: '["employee.profile.view"]' },
    ]);
    const map = await resolveScopedGrants(prisma, tenantPrisma, { role: 'panel', organizationId: 'o1', userId: 'u1' }, ['org:view']);
    expect(map.get('org:view')).toEqual([{ type: 'tenant', id: null }]);
    expect(map.get('employee.profile.view')).toEqual([{ type: 'legal_entity', id: 'e1' }, { type: 'location', id: 'l1' }]);
    expect(map.get('employee.salary.view')).toEqual([{ type: 'legal_entity', id: 'e1' }]);
  });

  it('a key whose module has no record scope confers nothing below the company (fail closed)', async () => {
    const { prisma, tenantPrisma } = build([{ scope_type: 'legal_entity', target: 'e1', permissions_json: '["candidate:manage","org.settings.manage","org.structure.view"]' }, { scope_type: 'location', target: 'l1', permissions_json: '["org.settings.manage"]' }]);
    const keys = await resolvePermissionGrants(prisma, tenantPrisma, { role: 'panel', organizationId: 'o1', userId: 'u1' }, []);
    expect([...keys].sort()).toEqual(['org.settings.manage', 'org.structure.view', 'org:view']);
    const map = await resolveScopedGrants(prisma, tenantPrisma, { role: 'panel', organizationId: 'o1', userId: 'u1' }, []);
    expect(map.get('org.settings.manage')).toEqual([{ type: 'legal_entity', id: 'e1' }]);
  });

  it('without a user (exam runtime socket) or a company, only the base role counts', async () => {
    const { prisma, tenantPrisma, tx } = build([{ scope_type: 'tenant', target: null, permissions_json: '["employee.profile.view"]' }]);
    expect([...(await resolvePermissionGrants(prisma, tenantPrisma, { role: 'panel', organizationId: 'o1' }, []))]).toEqual(['org:view']);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('a company override of a base role never confers HR or pay keys, even one stored before they were refused (P02 §4.6, R1)', async () => {
    const { prisma, tenantPrisma, tx } = build([]);
    tx.orgRolePermission.findUnique.mockResolvedValue({ permissionsJson: JSON.stringify(['org:view', 'employee.profile.view', 'employee.salary.view', 'employee.aadhaar.view', 'pay.range.view', 'org.entity.statutory.manage']) });
    const keys = await resolvePermissionGrants(prisma, tenantPrisma, { role: 'panel', organizationId: 'o1', userId: 'u1' }, []);
    expect([...keys]).toEqual(['org:view']);
  });
});

describe('a profile on top of a role (founder 8 Oct 2026)', () => {
  const build = (profileKeys: string[], adminKeys: string[]) => {
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue(adminKeys.map((key) => ({ permission: { key } }))) } };
    const tx = { permissionProfile: { findUnique: jest.fn().mockResolvedValue({ permissionsJson: JSON.stringify(profileKeys) }) }, $queryRaw: jest.fn().mockResolvedValue([]) };
    const tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    return { prisma: prisma as never, tenantPrisma: tenantPrisma as never };
  };
  it('a System Admin with the HR Admin profile keeps the System Admin keys and gains the HR keys', async () => {
    const { prisma, tenantPrisma } = build(['employee.profile.view'], ['audit:view', 'access.role.manage']);
    const keys = await resolvePermissionGrants(prisma, tenantPrisma, { role: 'org_admin', organizationId: 'o1', userId: 'u1', permissionProfileId: 'p1' }, []);
    expect([...keys].sort()).toEqual(['access.role.manage', 'audit:view', 'employee.profile.view']);
  });
  it('anyone else with a profile gets the profile keys only (the role does not add to it)', async () => {
    const { prisma, tenantPrisma } = build(['employee.profile.view'], ['interview:view_assigned']);
    const keys = await resolvePermissionGrants(prisma, tenantPrisma, { role: 'panel', organizationId: 'o1', userId: 'u1', permissionProfileId: 'p1' }, []);
    expect([...keys]).toEqual(['employee.profile.view']);
  });
});

describe('grant scopes per key (P02 §4.3)', () => {
  it('people keys and structure reads narrow to any scope; organisation changes and pay ranges to an entity; others company-wide', () => {
    expect(grantScopesFor('employee.salary.view')).toContain('all_reports');
    expect(grantScopesFor('request.raise_on_behalf')).toContain('direct_reports');
    expect(grantScopesFor('org.structure.view')).toContain('location');
    expect(grantScopesFor('org.settings.manage')).toEqual(['tenant', 'legal_entity']);
    expect(grantScopesFor('pay.range.manage')).toEqual(['tenant', 'legal_entity']);
    expect(grantScopesFor('access.role.manage')).toEqual(['tenant']);
    expect(grantScopesFor('candidate:manage')).toEqual(['tenant']);
  });
});

describe('employee field classes (P02 §4.4, YX-SEC-07/08)', () => {
  it('pay and identifiers are Confidential, Aadhaar Special, contacts Personal', () => {
    expect(EMPLOYEE_FIELD_CLASSES.compensation).toBe('confidential');
    expect(EMPLOYEE_FIELD_CLASSES.bankAccount).toBe('confidential');
    expect(EMPLOYEE_FIELD_CLASSES.aadhaar).toBe('special');
    expect(EMPLOYEE_FIELD_CLASSES.personalPhone).toBe('personal');
    expect([EMPLOYEE_FIELD_CLASSES.personPhone, EMPLOYEE_FIELD_CLASSES.personEmail]).toEqual(['personal', 'personal']);
    expect(EMPLOYEE_FIELD_CLASSES.designation).toBe('public');
  });
  it('Confidential keys are recognised; masking keeps the last four only', () => {
    expect(holdsConfidential(['employee.profile.view'])).toBe(false);
    expect(holdsConfidential(['employee.aadhaar.view'])).toBe(true);
    expect(CONFIDENTIAL_KEYS).toEqual(expect.arrayContaining(['employee.salary.view', 'pay.range.view', 'org.entity.statutory.manage']));
    expect(maskTail('6789')).toBe('•••• 6789');
    expect(maskTail(null)).toBeNull();
  });
});
