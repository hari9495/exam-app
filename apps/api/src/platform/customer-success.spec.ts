import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { STEP_UP_REQUIRED } from '../auth/step-up.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { tenantHealth } from '../service-desk/tenant-health';
import { CustomerSuccessController } from './customer-success.controller';
import { CS_SETTINGS, alertsFor, CHURN_OF, bandOf, dayPlus, istDay, thirtyDayChange } from './customer-success.service';
import { PlatformStaffGuard } from './platform-staff.guard';

// YukthiX console C-2, Customer success (answers 1047, 1048, 1058).
const handlers = (controller: { prototype: object }) => {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined).map((m) => [m, proto[m] as object] as const);
};
const keysOf = (h: object): string[] => [...(Reflect.getMetadata(PERMISSIONS_KEY, h) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, h) ?? [])];

describe('Customer success routes', () => {
  it('staff only: sign-in, the staff guard, then the permission guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CustomerSuccessController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
  });

  it('every route needs the Customer success key, and that key is never part of a company role', () => {
    const list = handlers(CustomerSuccessController);
    expect(list.map(([n]) => n).sort()).toEqual(['alerts', 'approve', 'health', 'messages', 'outreach', 'owners', 'reject', 'ruleNotice', 'setOwner', 'settings', 'updateAlert', 'withdraw', 'write']);
    // Answer 1065: a rule notice also needs the Rules editor key.
    for (const [name, h] of list) expect({ name, keys: keysOf(h) }).toEqual({ name, keys: name === 'ruleNotice' ? ['platform.customers.success', 'platform.statutory.manage'] : ['platform.customers.success'] });
    expect(isAssignableKey('platform.customers.success')).toBe(false);
    expect(isAssignableKey('platform.settings.manage')).toBe(false);
  });

  it('approving a message (the send to many companies) needs a fresh step-up; writing one does not', () => {
    const proto = CustomerSuccessController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(STEP_UP_REQUIRED, proto.approve!)).toBe(true);
    expect(Reflect.getMetadata(STEP_UP_REQUIRED, proto.write!)).toBeUndefined();
  });
});

describe('churn alerts (answer 1047)', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const defaults = { 'cs.alert.health_below': CS_SETTINGS['cs.alert.health_below'].default, 'cs.alert.admin_idle_days': CS_SETTINGS['cs.alert.admin_idle_days'].default, 'cs.snapshot.keep_days': CS_SETTINGS['cs.snapshot.keep_days'].default };

  it('the defaults are below 50 and 30 days; snapshots kept 400 days', () => {
    expect(defaults).toEqual({ 'cs.alert.health_below': 50, 'cs.alert.admin_idle_days': 30, 'cs.snapshot.keep_days': 400 });
  });

  it('score: below the threshold alerts, at it does not', () => {
    expect(alertsFor({ health: 49, adminLastSignIn: ago(1) }, defaults, now)).toEqual(['Health score below 50']);
    expect(alertsFor({ health: 50, adminLastSignIn: ago(1) }, defaults, now)).toEqual([]);
  });

  it('idle: from the threshold day on; never signed in alerts too', () => {
    expect(alertsFor({ health: 80, adminLastSignIn: ago(29) }, defaults, now)).toEqual([]);
    expect(alertsFor({ health: 80, adminLastSignIn: ago(30) }, defaults, now)).toEqual(['No System Admin sign-in for 30 days']);
    expect(alertsFor({ health: 80, adminLastSignIn: null }, defaults, now)).toEqual(['No System Admin has ever signed in']);
  });

  it('the thresholds come from the settings', () => {
    const strict = { 'cs.alert.health_below': 81, 'cs.alert.admin_idle_days': 7, 'cs.snapshot.keep_days': 400 };
    expect(alertsFor({ health: 80, adminLastSignIn: ago(8) }, strict, now)).toEqual(['Health score below 81', 'No System Admin sign-in for 8 days']);
  });
});

describe('the one health score (Support desk panel and the console list)', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  it('starts at 80 and goes down for each reason, never below 0', () => {
    expect(tenantHealth({ lifecycle: 'active', billingStatus: 'active', adminLastSignIn: now, open: 0, csat: null, nps: null }, now)).toEqual({ health: 80, factors: [] });
    const bad = tenantHealth({ lifecycle: 'suspended', billingStatus: 'past_due', adminLastSignIn: null, open: 4, csat: 3, nps: -10 }, now);
    expect(bad.health).toBe(0);
    expect(bad.factors).toEqual(['Billing or account is not in good standing', 'No admin sign-in for 30 days', '4 open tickets', 'Low ratings', 'More detractors than promoters']);
    expect(tenantHealth({ lifecycle: 'trial', billingStatus: 'active', adminLastSignIn: now, open: 3, csat: 3.5, nps: 0 }, now)).toEqual({ health: 80, factors: ['In trial'] });
  });
});

// Answer 1082 (1165): the 30-day change and the drawn bands.
describe('health history', () => {
  it('the 30-day change compares with the snapshot of 30 India days before, across a month end and a short month', () => {
    // 1 Mar 2027 less 30 days is 30 Jan 2027 (February has 28 days).
    expect(dayPlus('2027-03-01', -30)).toBe('2027-01-30');
    expect(thirtyDayChange('2027-03-01', 62, [{ day: '2027-01-30', score: 70 }, { day: '2027-01-31', score: 90 }])).toBe(-8);
    // 31 Dec less 30 is 1 Dec; a later snapshot (2 Dec) is not used.
    expect(thirtyDayChange('2026-12-31', 55, [{ day: '2026-12-01', score: 40 }, { day: '2026-12-02', score: 99 }])).toBe(15);
    // A missed night uses the snapshot before it; none at all gives no change.
    expect(thirtyDayChange('2026-12-31', 55, [{ day: '2026-11-28', score: 50 }])).toBe(5);
    expect(thirtyDayChange('2026-12-31', 55, [{ day: '2026-12-15', score: 50 }])).toBeNull();
  });

  it('the India day turns at midnight IST', () => {
    expect(istDay(new Date('2026-11-30T18:29:00Z'))).toBe('2026-11-30');
    expect(istDay(new Date('2026-11-30T18:30:00Z'))).toBe('2026-12-01');
  });

  it('bands and churn risk follow the drawn thresholds', () => {
    expect([bandOf(70), bandOf(69), bandOf(45), bandOf(44)]).toEqual(['healthy', 'watch', 'watch', 'at_risk']);
    expect(CHURN_OF.at_risk).toBe('high');
  });
});
