import { httpProvider } from './http-provider';
import { indeedProvider } from './indeed-provider';
import { linkedinProvider } from './linkedin-provider';
import { JobBoardAdapter, JobBoardProviderId } from './types';

export * from './types';

// 'xml_feed' is the default free pull board (no adapter); only these are paid push providers.
export const JOB_BOARD_PROVIDERS: Record<JobBoardProviderId, JobBoardAdapter> = {
  linkedin: linkedinProvider,
  indeed: indeedProvider,
  http: httpProvider,
};

export function getJobBoardProvider(id: string): JobBoardAdapter | undefined {
  return JOB_BOARD_PROVIDERS[id as JobBoardProviderId];
}

export function listJobBoardProviders(): JobBoardAdapter[] {
  return Object.values(JOB_BOARD_PROVIDERS);
}

export const PAID_PROVIDER_IDS = Object.keys(JOB_BOARD_PROVIDERS) as JobBoardProviderId[];
/** Every valid `provider` value on a JobBoard row (the free default plus the paid push ones). */
export const ALL_PROVIDER_IDS = ['xml_feed', ...PAID_PROVIDER_IDS] as const;
