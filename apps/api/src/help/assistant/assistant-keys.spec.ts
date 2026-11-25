import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { PERMISSIONS_ANY_KEY, PERMISSIONS_KEY } from '../../rbac/permissions.decorator';
import { isAssignableKey } from '../../rbac/assignable-permissions';
import { KEY_WORDS } from '../../platform/staff-roles.service';
import { AssistantController, AssistantStaffController, FEATURE_REQUESTS_KEY } from './assistant.controller';
import { SALES_KEY } from './assistant.service';

const keysOf = (cls: { prototype: object }, name: string) => {
  const fn = (cls.prototype as Record<string, object>)[name]!;
  return { all: Reflect.getMetadata(PERMISSIONS_KEY, fn) ?? [], any: Reflect.getMetadata(PERMISSIONS_ANY_KEY, fn) ?? [] };
};

// Ask YukthiX follow-ups: the keys behind each route (answers 2112, 2113).
describe('Ask YukthiX route keys', () => {
  it('2113: feature requests need their own console key; the review takes it or the help centre writers’ key', () => {
    expect(FEATURE_REQUESTS_KEY).toBe('platform.feature_requests.manage');
    expect(keysOf(AssistantStaffController, 'list')).toEqual({ all: [FEATURE_REQUESTS_KEY], any: [] });
    expect(keysOf(AssistantStaffController, 'decide')).toEqual({ all: [FEATURE_REQUESTS_KEY], any: [] });
    expect(keysOf(AssistantStaffController, 'review')).toEqual({ all: [], any: [FEATURE_REQUESTS_KEY, 'platform.helpcentre.write'] });
    // negative: the help centre writers' key alone no longer decides requests; no company profile can hold the new key.
    expect(keysOf(AssistantStaffController, 'decide').all).not.toContain('platform.helpcentre.write');
    expect(isAssignableKey(FEATURE_REQUESTS_KEY)).toBe(false);
    expect(KEY_WORDS[FEATURE_REQUESTS_KEY]).toBeTruthy();
  });

  it('2112: the sales request from a chat needs Plan & add-ons’ key; the other chat routes stay open to everyone', () => {
    expect(SALES_KEY).toBe('org:manage_billing');
    expect(Reflect.getMetadata(PATH_METADATA, (AssistantController.prototype as unknown as Record<string, object>).salesRequest!)).toBe('conversations/:id/sales-request');
    expect(keysOf(AssistantController, 'salesRequest')).toEqual({ all: [SALES_KEY], any: [] });
    expect(keysOf(AssistantController, 'featureRequest')).toEqual({ all: [], any: [] });
  });
});
