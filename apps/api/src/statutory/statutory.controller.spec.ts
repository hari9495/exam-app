import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { STEP_UP_REQUIRED } from '../auth/step-up.decorator';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { StatutoryConsoleController } from './statutory.controller';
import { jurisdictionPlace, ruleState, sizeBand } from './statutory.service';

// Console C-1: every rule-store route is staff only with the Rules editor key; only publishing asks for the key again.
describe('StatutoryConsoleController (console C-1)', () => {
  const routes = Object.getOwnPropertyNames(StatutoryConsoleController.prototype).filter((n) => n !== 'constructor');

  it('every route: PlatformStaffGuard and PermissionsGuard, and platform.statutory.manage', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StatutoryConsoleController)).toEqual(expect.arrayContaining([PlatformStaffGuard, PermissionsGuard]));
    expect(Reflect.getMetadata(PERMISSIONS_KEY, StatutoryConsoleController)).toEqual(['platform.statutory.manage']);
    expect(routes.sort()).toEqual(['draft', 'get', 'impact', 'list', 'publish', 'requestChanges', 'run', 'sendForReview', 'update']);
  });

  it('only publish needs the security key again (1041)', () => {
    const stepUp = routes.filter((r) => Reflect.getMetadata(STEP_UP_REQUIRED, StatutoryConsoleController.prototype[r as keyof StatutoryConsoleController]) === true);
    expect(stepUp).toEqual(['publish']);
  });
});

describe('rule helpers', () => {
  it('review states: a draft with a note is "changes requested"', () => {
    expect(ruleState({ status: 'in_review', reviewNote: null })).toBe('in review');
    expect(ruleState({ status: 'draft', reviewNote: 'Add February' })).toBe('changes requested');
    expect(ruleState({ status: 'draft', reviewNote: null })).toBe('draft');
    expect(ruleState({ status: 'published', reviewNote: 'old note' })).toBe('published');
  });

  it('a jurisdiction is a country or a state; others cannot be counted; size bands at their limits', () => {
    expect(jurisdictionPlace('IN')).toEqual({ country: 'IN' });
    expect(jurisdictionPlace('IN-KA')).toEqual({ state: 'IN-KA' });
    expect(jurisdictionPlace('US-NY')).toEqual({ state: 'US-NY' });
    for (const j of ['EU', 'GENERIC', 'in-ka', '']) expect(jurisdictionPlace(j)).toBeNull();
    expect([0, 49, 50, 199, 200, 999, 1000].map(sizeBand)).toEqual(['Under 50', 'Under 50', '50–200', '50–200', '200–1,000', '200–1,000', '1,000+']);
  });
});
