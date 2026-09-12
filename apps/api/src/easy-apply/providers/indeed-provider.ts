import { EasyApplyAdapter, NormalizedApplication, normalizeCommon, secretsMatch } from './types';

export const indeedEasyApply: EasyApplyAdapter = {
  id: 'indeed',
  label: 'Indeed Apply',
  verify(storedSecret, providedSecret): boolean {
    return secretsMatch(storedSecret, providedSecret);
  },
  normalize(payload: unknown): NormalizedApplication {
    return normalizeCommon(payload, 'Indeed');
  },
};
