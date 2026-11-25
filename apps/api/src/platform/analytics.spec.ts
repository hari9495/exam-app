import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { PlatformStaffGuard } from './platform-staff.guard';
import { AnalyticsController } from './analytics.controller';
import { summarise } from './analytics.service';

// YukthiX console C-8, YX-09: product analytics, counts only; a group of fewer than 5 companies is hidden.
describe('product analytics', () => {
  it('staff only, behind the analytics key (never a company key)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AnalyticsController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AnalyticsController.prototype.overview)).toEqual(['platform.analytics.view']);
    expect(isAssignableKey('platform.analytics.view')).toBe(false);
  });

  const at = new Date('2026-11-10T00:00:00Z');
  const small = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, employees: 20 }));
  const use = (ids: string[], family: string) => ids.map((organizationId) => ({ organizationId, family, actions: 3, last: at }));

  it('a feature used by 5 companies is counted; by 4 it is hidden (null), never 4', () => {
    const cos = small(10, 'c');
    const s = summarise(cos, [...use(['c0', 'c1', 'c2', 'c3', 'c4'], 'leave'), ...use(['c0', 'c1', 'c2', 'c3'], 'payroll')], 5);
    expect(s.byFeature.find((f) => f.area === 'time')).toMatchObject({ companies: 5, actions: 15 });
    expect(s.byFeature.find((f) => f.area === 'payroll')).toMatchObject({ companies: null, actions: null });
  });

  it('a size band of fewer than 5 companies is hidden, and so is its share of every feature', () => {
    const cos = [...small(6, 's'), { id: 'b0', employees: 300 }, { id: 'b1', employees: 300 }];
    const s = summarise(cos, use(['s0', 's1', 's2', 's3', 's4', 'b0', 'b1'], 'employee'), 5);
    expect(s.bySize.bands.map((b) => b.companies)).toEqual([6, null]);
    expect(s.bySize.adoption.find((a) => a.area === 'people')!.pct).toEqual([83, null]);
  });

  it('families outside the feature list (sign-ins, staff, settings) are never counted; by company: counts only', () => {
    const s = summarise(small(5, 'c'), [...use(['c0'], 'login'), ...use(['c0'], 'employee')], 5);
    expect(s.byCompany).toEqual([{ id: 'c0', areas: { people: 3 }, lastActive: at.toISOString() }]);
  });
});
