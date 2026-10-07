import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { MfaRequiredException, PermissionsGuard } from '../rbac/permissions.guard';
import { STEP_UP_REQUIRED } from '../auth/step-up.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { PlatformController, SupportAccessController } from './platform.controller';
import { PlatformStaffGuard } from './platform-staff.guard';
import { enforceSupportSession } from './support-session-access';

const handlers = (controller: { prototype: object }) => {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined).map((m) => [m, proto[m] as object] as const);
};
const keysOf = (h: object): string[] => [...(Reflect.getMetadata(PERMISSIONS_KEY, h) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, h) ?? [])];
const stepUp = (h: object) => Reflect.getMetadata(STEP_UP_REQUIRED, h) === true;

describe('platform console routes (P14 YX-CONSOLE-01, P02 Q8)', () => {
  it('the console runs behind sign-in, the staff guard and the permission guard, in that order', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
  });

  it('every console route names a platform.* key, and nothing else', () => {
    const list = handlers(PlatformController);
    expect(list.length).toBeGreaterThan(10);
    for (const [name, h] of list) {
      const keys = keysOf(h);
      expect({ name, ok: keys.length > 0 && keys.every((k) => k.startsWith('platform.')) }).toEqual({ name, ok: true });
    }
  });

  it('suspending or closing a company, changing a price and changing shared account secrets need a fresh step-up', () => {
    const proto = PlatformController.prototype as unknown as Record<string, object>;
    for (const name of ['lifecycle', 'schedulePrice', 'withdrawPrice', 'createSms', 'updateSms', 'removeSms']) expect({ name, step: stepUp(proto[name]) }).toEqual({ name, step: true });
  });

  it('the company side is the System Admin key on every route; approving needs a step-up', () => {
    for (const [name, h] of handlers(SupportAccessController)) expect({ name, keys: keysOf(h) }).toEqual({ name, keys: ['org.support_access.approve'] });
    expect(stepUp((SupportAccessController.prototype as unknown as Record<string, object>).approve)).toBe(true);
  });

  it('no company role can ever hold a console key or the support approval', () => {
    for (const key of ['platform.companies.view', 'platform.companies.manage', 'platform.plans.manage', 'platform.channels.manage', 'platform.support.request', 'platform.audit.view', 'platform:manage_organizations', 'org.support_access.approve']) {
      expect({ key, assignable: isAssignableKey(key) }).toEqual({ key, assignable: false });
    }
    expect(isAssignableKey('org.structure.view')).toBe(true);
  });
});

describe('PlatformStaffGuard', () => {
  const guard = new PlatformStaffGuard();
  const AAL2 = { assuranceLevel: 'aal2', mfaVerifiedAt: new Date(), mfaMethod: 'passkey', mfaEnrolmentDueAt: new Date() };
  const run = (user: unknown) => guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ user }) }) } as never);

  it('lets in a staff account on its own platform session with its security key', () => {
    expect(run({ role: 'super_admin', organizationId: null, session: AAL2 })).toBe(true);
  });

  it('refuses company accounts, staff inside a company and impersonation', () => {
    expect(() => run({ role: 'org_admin', organizationId: 'org-1', session: AAL2 })).toThrow(ForbiddenException);
    expect(() => run({ role: 'super_admin', organizationId: 'org-1', actingSuperAdmin: true, session: AAL2 })).toThrow(ForbiddenException);
    expect(() => run({ role: 'super_admin', organizationId: null, impersonatorUserId: 'x', session: AAL2 })).toThrow(ForbiddenException);
    expect(() => run(undefined)).toThrow(ForbiddenException);
  });

  it('refuses a staff session without the security key, even inside the enrolment grace (P12 Q7)', () => {
    expect(() => run({ role: 'super_admin', organizationId: null, session: { ...AAL2, assuranceLevel: 'aal1', mfaEnrolmentDueAt: new Date(Date.now() + 86_400_000) } })).toThrow(MfaRequiredException);
  });
});

describe('enforceSupportSession (inside a company)', () => {
  const token = { sub: 'staff-1', organizationId: 'org-1', supportSessionId: 'ss-1' };
  let live: unknown;
  let audits: unknown[];
  let contexts: unknown[];
  const tenantPrisma = {
    forTenant: jest.fn(async (ctx: unknown, fn: (tx: unknown) => unknown) => {
      contexts.push(ctx);
      return fn({
        supportSession: { findFirst: jest.fn(async () => live) },
        user: { findUnique: jest.fn(async () => null) },
        auditLog: { create: jest.fn(async (row: unknown) => audits.push(row)) },
      });
    }),
  };
  const req = (method: string, path: string) => ({ method, path }) as never;

  beforeEach(() => {
    live = { id: 'ss-1', endsAt: new Date(Date.now() + 3_600_000) };
    audits = [];
    contexts = [];
  });

  it('records every read in the company audit log under the session, looking the session up in the company only', async () => {
    await enforceSupportSession(tenantPrisma as never, req('GET', '/api/v1/people/employees'), token);
    expect(contexts[0]).toEqual({ organizationId: 'org-1', isSuperAdmin: false });
    expect(audits).toEqual([{ data: expect.objectContaining({ organizationId: 'org-1', action: 'support_session.request', entityType: 'support_session', entityId: 'ss-1', metadataJson: JSON.stringify({ method: 'GET', path: '/people/employees' }) }) }]);
  });

  it('is read-only: any change is refused and not recorded as done', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      await expect(enforceSupportSession(tenantPrisma as never, req(method, '/api/v1/org/legal-entities'), token)).rejects.toMatchObject({ response: { code: 'SUPPORT_SESSION_READ_ONLY' } });
    }
    expect(audits).toEqual([]);
  });

  it('reaches only the YukthiX HR pages: hiring, assessments and everything else are out of scope', async () => {
    for (const path of ['/api/v1/candidates', '/api/v1/attempts/a1/evidence', '/api/v1/questions', '/api/v1/organizations/integrations', '/api/v1/orgx', '/api/v1/users']) {
      await expect(enforceSupportSession(tenantPrisma as never, req('GET', path), token)).rejects.toMatchObject({ response: { code: 'SUPPORT_SESSION_OUT_OF_SCOPE' } });
    }
    await expect(enforceSupportSession(tenantPrisma as never, req('GET', '/api/v1/org'), token)).resolves.toBeUndefined();
    await expect(enforceSupportSession(tenantPrisma as never, req('GET', '/api/v1/users/me'), token)).resolves.toBeUndefined();
    expect(audits).toHaveLength(2);
  });

  it('refuses everything once the session has ended, expired or was ended by the company', async () => {
    live = null;
    await expect(enforceSupportSession(tenantPrisma as never, req('GET', '/api/v1/people/employees'), token)).rejects.toMatchObject({ response: { code: 'SUPPORT_SESSION_ENDED' } });
  });

  it('always lets the staff member leave or sign out, even after the window', async () => {
    live = null;
    await expect(enforceSupportSession(tenantPrisma as never, req('POST', '/api/v1/auth/super-admin/switch-out'), token)).resolves.toBeUndefined();
    await expect(enforceSupportSession(tenantPrisma as never, req('POST', '/api/v1/auth/logout'), token)).resolves.toBeUndefined();
    await expect(enforceSupportSession(tenantPrisma as never, req('GET', '/api/v1/auth/super-admin/switch-out'), token)).rejects.toMatchObject({ response: { code: 'SUPPORT_SESSION_ENDED' } });
  });
});
