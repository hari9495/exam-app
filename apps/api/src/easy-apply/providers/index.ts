import { indeedEasyApply } from './indeed-provider';
import { linkedinEasyApply } from './linkedin-provider';
import { EasyApplyAdapter, EasyApplyProviderId } from './types';

export * from './types';

export const EASY_APPLY_PROVIDERS: Record<EasyApplyProviderId, EasyApplyAdapter> = {
  indeed: indeedEasyApply,
  linkedin: linkedinEasyApply,
};

export function getEasyApplyProvider(id: string): EasyApplyAdapter | undefined {
  return EASY_APPLY_PROVIDERS[id as EasyApplyProviderId];
}

export function listEasyApplyProviders(): EasyApplyAdapter[] {
  return Object.values(EASY_APPLY_PROVIDERS);
}

export const EASY_APPLY_PROVIDER_IDS = Object.keys(EASY_APPLY_PROVIDERS) as EasyApplyProviderId[];
