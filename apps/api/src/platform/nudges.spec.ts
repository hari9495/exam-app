import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { PlatformStaffGuard } from './platform-staff.guard';
import { MyNudgeController, NudgesController } from './nudges.controller';
import { pickNudge } from './nudges.service';

// YukthiX console C-8, YX-12: nudges per feature switch.
describe('nudge routes', () => {
  it('console: staff only, every route behind the nudges key (never a company key)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, NudgesController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
    const proto = NudgesController.prototype as unknown as Record<string, object>;
    const list = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m]) !== undefined);
    expect(list.sort()).toEqual(['overview', 'retire', 'review', 'write']);
    for (const name of list) {
      const keys = [...(Reflect.getMetadata(PERMISSIONS_KEY, proto[name]) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[name]) ?? [])];
      expect({ name, keys }).toEqual({ name, keys: ['platform.nudges.write'] });
    }
    expect(isAssignableKey('platform.nudges.write')).toBe(false);
  });

  it('company side: any signed-in person may ask (the service decides who can act)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MyNudgeController)).toEqual([JwtAuthGuard]);
  });
});

describe('which nudge a person sees (weekly limit)', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const days = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };

  it('the first one not seen yet, counted as new', () => {
    expect(pickNudge([a, b], [], 2, now)).toEqual({ nudge: a, isNew: true, again: false });
    expect(pickNudge([a, b], [{ nudgeId: 'a', shownAt: days(10), dismissedAt: days(10) }], 2, now)).toEqual({ nudge: b, isNew: true, again: false });
  });

  it('one shown this week and not put away keeps showing, without a new count', () => {
    expect(pickNudge([a, b], [{ nudgeId: 'a', shownAt: days(1), dismissedAt: null }], 1, now)).toEqual({ nudge: a, isNew: false, again: false });
  });

  it('the weekly limit: 2 shown in 7 days, no third; after 7 days one more', () => {
    const two = [
      { nudgeId: 'a', shownAt: days(2), dismissedAt: days(2) },
      { nudgeId: 'b', shownAt: days(6.9), dismissedAt: days(6) },
    ];
    expect(pickNudge([a, b, c], two, 2, now)).toBeNull();
    expect(pickNudge([a, b, c], [two[0]!, { ...two[1]!, shownAt: days(7) }], 2, now)).toEqual({ nudge: c, isNew: true, again: false });
  });

  it('a limit of 0 shows nothing; nothing eligible shows nothing (a killed switch is never eligible)', () => {
    expect(pickNudge([a], [], 0, now)).toBeNull();
    expect(pickNudge([], [{ nudgeId: 'a', shownAt: days(1), dismissedAt: null }], 2, now)).toBeNull();
  });

  it('Not now hides it for the return days (default 14), then it may show again; 0 never again', () => {
    const away = [{ nudgeId: 'a', shownAt: days(20), dismissedAt: days(13) }];
    expect(pickNudge([a], away, 2, now, 14)).toBeNull();
    expect(pickNudge([a], [{ ...away[0]!, dismissedAt: days(14) }], 2, now, 14)).toEqual({ nudge: a, isNew: true, again: true });
    expect(pickNudge([a], [{ ...away[0]!, dismissedAt: days(60) }], 2, now, 0)).toBeNull();
  });
});
