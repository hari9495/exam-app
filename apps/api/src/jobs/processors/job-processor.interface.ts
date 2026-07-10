export interface JobProcessor {
  readonly type: string;
  process(input: unknown): Promise<unknown>;
}

export const AI_JOB_PROCESSORS = 'AI_JOB_PROCESSORS';
