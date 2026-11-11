import 'reflect-metadata';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isAssignableKey } from '../rbac/assignable-permissions';
import { PlatformStaffGuard } from '../platform/platform-staff.guard';
import { HelpCentreController } from './help-centre.controller';
import { HELP_SETTINGS } from './help-centre.service';

// YukthiX console C-8, YX-11 (answer 1057): the help-centre editor's routes and rules.
describe('help-centre routes', () => {
  it('staff only, every route behind the help-centre key (never a company key)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, HelpCentreController)).toEqual([JwtAuthGuard, PlatformStaffGuard, PermissionsGuard]);
    const proto = HelpCentreController.prototype as unknown as Record<string, object>;
    const list = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[m]) !== undefined);
    expect(list.sort()).toEqual(['create', 'get', 'overview', 'review', 'save', 'saveSettings', 'submit']);
    for (const name of list) {
      const keys = [...(Reflect.getMetadata(PERMISSIONS_KEY, proto[name]) ?? []), ...(Reflect.getMetadata(PERMISSIONS_ANY_KEY, proto[name]) ?? [])];
      expect({ name, keys }).toEqual({ name, keys: ['platform.helpcentre.write'] });
    }
    expect(isAssignableKey('platform.helpcentre.write')).toBe(false);
  });

  it('the no-result list never goes under 5 companies (as C-1 did); defaults 5 companies over 30 days', () => {
    expect(HELP_SETTINGS['helpcentre.gaps_min_companies']).toMatchObject({ default: 5, min: 5 });
    expect(HELP_SETTINGS['helpcentre.gaps_days']).toMatchObject({ default: 30, min: 7, max: 180 });
  });
});
