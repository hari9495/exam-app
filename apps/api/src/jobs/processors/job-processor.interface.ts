import { TenantContext } from '@exam-platform/shared';

export interface JobProcessor {
  readonly type: string;
  // aiJobId is passed explicitly rather than merged into `input`, so a processor that stamps
  // provenance onto the rows it writes cannot confuse it with a caller-supplied field.
  process(input: unknown, context: TenantContext, aiJobId: string): Promise<unknown>;
}

export const AI_JOB_PROCESSORS = 'AI_JOB_PROCESSORS';
