import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { PlatformStaffGuard } from './platform-staff.guard';
import { IncidentsController } from './incidents.controller';
import { dueReminders, incidentRef } from './incidents.service';

// YukthiX console C-8, YX-10 incidents and answer 1124 (breach reminders).
describe('incident routes', () => {
  it('staff only, every route behind the incidents key (never a company key)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, IncidentsController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
    const proto = IncidentsController.prototype as unknown as Record<string, object>;
    const list = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m]) !== undefined);
    expect(list.sort()).toEqual(['markBreach', 'open', 'overview', 'postUpdate', 'review', 'saveSettings']);
    for (const name of list) {
      const keys = [...(Reflect.getMetadata(PERMISSIONS_KEY, proto[name]) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[name]) ?? [])];
      expect({ name, keys }).toEqual({ name, keys: ['platform.incidents.manage'] });
    }
    expect(isAssignableKey('platform.incidents.manage')).toBe(false);
  });

  it('references read INC-044', () => {
    expect(incidentRef(44)).toBe('INC-044');
    expect(incidentRef(1234)).toBe('INC-1234');
  });
});

describe('answer 1124: breach reminders', () => {
  const contained = new Date('2026-11-12T00:00:00Z');
  const clocks = { certinDueAt: new Date(contained.getTime() + 6 * 3_600_000), dpdpDueAt: new Date(contained.getTime() + 72 * 3_600_000) };
  const none = { certinRemindedAt: null, dpdpRemindedAt: null };
  const at = (h: number) => new Date(contained.getTime() + h * 3_600_000);

  it('nothing before the lead time; CERT-In from 1 hour before its due time (the default lead)', () => {
    expect(dueReminders(none, clocks, 1, at(4.99))).toEqual([]);
    expect(dueReminders(none, clocks, 1, at(5))).toEqual(['certin']);
  });

  it('DPDP from 1 hour before its own due time; each clock only once', () => {
    expect(dueReminders({ certinRemindedAt: at(5), dpdpRemindedAt: null }, clocks, 1, at(70.9))).toEqual([]);
    expect(dueReminders({ certinRemindedAt: at(5), dpdpRemindedAt: null }, clocks, 1, at(71))).toEqual(['dpdp']);
    expect(dueReminders({ certinRemindedAt: at(5), dpdpRemindedAt: at(71) }, clocks, 1, at(100))).toEqual([]);
  });

  it('a lead of 0 reminds at the due time; a breach linked late reminds both at once', () => {
    expect(dueReminders(none, clocks, 0, at(5.99))).toEqual([]);
    expect(dueReminders(none, clocks, 0, at(6))).toEqual(['certin']);
    expect(dueReminders(none, clocks, 1, at(80))).toEqual(['certin', 'dpdp']);
  });
});
