import { TenantContext } from '@exam-platform/shared';

export interface JobProcessor {
  readonly type: string;
  process(input: unknown, context: TenantContext): Promise<unknown>;
}

export const AI_JOB_PROCESSORS = 'AI_JOB_PROCESSORS';
