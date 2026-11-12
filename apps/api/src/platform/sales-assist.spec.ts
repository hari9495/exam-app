import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { PlatformStaffGuard } from './platform-staff.guard';
import { SalesAssistController } from './sales-assist.controller';
import { TalkToUsController } from '../help/talk-to-us.controller';
import { sizeBand } from './sales-assist.service';

// YukthiX console C-8, YX-13 (answer 1210): the sales-assist queue.
describe('sales-assist routes', () => {
  it('console: staff only, every route behind the sales key (never a company key)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SalesAssistController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
    const proto = SalesAssistController.prototype as unknown as Record<string, object>;
    const list = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m]) !== undefined);
    expect(list.sort()).toEqual(['outcome', 'queue', 'take']);
    for (const name of list) {
      const keys = [...(Reflect.getMetadata(PERMISSIONS_KEY, proto[name]) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[name]) ?? [])];
      expect({ name, keys }).toEqual({ name, keys: ['platform.sales.work'] });
    }
    expect(isAssignableKey('platform.sales.work')).toBe(false);
  });

  it('Talk to us: any signed-in company person (the service checks the nudge was shown to them)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TalkToUsController)).toEqual([JwtAuthGuard]);
  });
});

describe('size bands (counts only)', () => {
  it('the drawn bands at their edges', () => {
    expect([0, 49, 50, 199, 200, 499, 500, 999, 1000, 2499, 2500].map(sizeBand)).toEqual(['Under 50', 'Under 50', '50–200', '50–200', '200–500', '200–500', '500–1,000', '500–1,000', '1,000–2,500', '1,000–2,500', '2,500+']);
  });
});
