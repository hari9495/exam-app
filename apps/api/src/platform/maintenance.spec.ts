import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { STEP_UP_REQUIRED } from '../auth/step-up.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { AvailabilityController, MaintenanceController } from './maintenance.controller';
import { MAINTENANCE_SETTINGS, currentMaintenance, maintenanceProblem, type MaintenanceRules } from './maintenance.service';
import { PlatformController } from './platform.controller';
import { PlatformStaffGuard } from './platform-staff.guard';

// YukthiX console C-5 (answers 948, 1053): planned maintenance and the company wizard's create.
const handlers = (controller: { prototype: object }) => {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m] as object) !== undefined).map((m) => [m, proto[m] as object] as const);
};
const keysOf = (h: object): string[] => [...(Reflect.getMetadata(PERMISSIONS_KEY, h) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, h) ?? [])];

const RULES: MaintenanceRules = { ...(Object.fromEntries(Object.entries(MAINTENANCE_SETTINGS).map(([k, v]) => [k, v.default])) as Record<keyof typeof MAINTENANCE_SETTINGS, number>), blockDates: [7, 15, 20] };
/** A time in India (IST) as a Date. */
const ist = (y: number, m: number, d: number, h = 1) => new Date(Date.UTC(y, m - 1, d, h) - 330 * 60_000);

describe('maintenance routes', () => {
  it('staff only, every route behind the maintenance key (never a company key)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MaintenanceController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
    const list = handlers(MaintenanceController);
    expect(list.map(([n]) => n).sort()).toEqual(['approve', 'cancel', 'overview', 'saveSettings', 'schedule']);
    // Staff roles (answer 1058): Customer success sees the windows (view key); every change needs the manage key.
    for (const [name, h] of list) expect({ name, keys: keysOf(h) }).toEqual({ name, keys: name === 'overview' ? ['platform.maintenance.view', 'platform.maintenance.manage'] : ['platform.maintenance.manage'] });
    expect(isAssignableKey('platform.maintenance.manage')).toBe(false);
    expect(isAssignableKey('platform.maintenance.view')).toBe(false);
  });

  it('the company side is one read for every signed-in person, with no key', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AvailabilityController)).toEqual([JwtAuthGuard]);
    expect(handlers(AvailabilityController).map(([n]) => n)).toEqual(['current']);
  });

  it('answer 1053: creating a company needs a fresh step-up and the companies key', () => {
    const create = (PlatformController.prototype as unknown as Record<string, object>).createCompany!;
    expect(Reflect.getMetadata(STEP_UP_REQUIRED, create)).toBe(true);
    expect(keysOf(create)).toEqual(['platform.companies.manage']);
  });
});

describe('maintenance rules (YX-10, answer 948; platform settings with defaults)', () => {
  const now = ist(2026, 11, 12, 10);
  it('the defaults: 72 hours notice, banner 24 hours before, at most 4 hours, not the first 7 or last 3 days, nor 7, 15, 20', () => {
    expect(RULES).toMatchObject({ 'maintenance.notice_hours': 72, 'maintenance.banner_hours': 24, 'maintenance.max_hours': 4, 'maintenance.block_first_days': 7, 'maintenance.block_last_days': 3 });
  });

  it('notice: 71 hours ahead is refused, 72 is fine', () => {
    expect(maintenanceProblem(new Date(now.getTime() + 71 * 3_600_000), 1, RULES, now)).toMatch(/Only 71 hours' notice/);
    expect(maintenanceProblem(ist(2026, 11, 18), 2, RULES, now)).toBeNull();
  });

  it('length, payroll-critical days and statutory dates, by the India day', () => {
    expect(maintenanceProblem(ist(2026, 11, 18), 5, RULES, now)).toMatch(/at most 4 hours/);
    expect(maintenanceProblem(ist(2026, 12, 7), 1, RULES, now)).toMatch(/payroll-critical/);
    expect(maintenanceProblem(ist(2026, 11, 28), 1, RULES, now)).toMatch(/payroll-critical/); // November has 30 days: 28 to 30 are the last 3
    expect(maintenanceProblem(ist(2026, 11, 27), 1, RULES, now)).toBeNull();
    expect(maintenanceProblem(ist(2026, 12, 15), 1, RULES, now)).toMatch(/15th is a statutory due date/);
    // 00:30 on the 8th in India is still the 7th in UTC: the India day decides.
    expect(maintenanceProblem(new Date(Date.UTC(2026, 11, 7, 19, 0)), 1, RULES, now)).toBeNull();
  });

  it('the rules come from the settings', () => {
    const loose = { ...RULES, 'maintenance.notice_hours': 24, 'maintenance.block_first_days': 0, blockDates: [] };
    expect(maintenanceProblem(ist(2026, 12, 1), 1, loose, now)).toBeNull();
  });
});

describe('what companies see (answer 948: banner before and during; never a block)', () => {
  const w = { title: 'Database upgrade', startsAt: ist(2026, 11, 18, 1), endsAt: ist(2026, 11, 18, 3) };
  it('nothing until the banner time, the day before, during, and nothing after', () => {
    expect(currentMaintenance([w], 24, new Date(w.startsAt.getTime() - 25 * 3_600_000))).toBeNull();
    expect(currentMaintenance([w], 24, new Date(w.startsAt.getTime() - 23 * 3_600_000))).toMatchObject({ phase: 'upcoming', title: 'Database upgrade' });
    expect(currentMaintenance([w], 24, new Date(w.startsAt.getTime() + 60_000))).toMatchObject({ phase: 'now' });
    expect(currentMaintenance([w], 24, w.endsAt)).toBeNull();
  });
  it('the banner time comes from the setting; the earliest window shows first', () => {
    expect(currentMaintenance([w], 48, new Date(w.startsAt.getTime() - 47 * 3_600_000))).toMatchObject({ phase: 'upcoming' });
    const later = { ...w, title: 'Later', startsAt: ist(2026, 11, 18, 5), endsAt: ist(2026, 11, 18, 6) };
    expect(currentMaintenance([later, w], 24, new Date(w.startsAt.getTime() - 3_600_000))?.title).toBe('Database upgrade');
  });
});
