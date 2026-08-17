export const PIPELINE_STAGES = ['applied', 'screened', 'interview', 'offer', 'hired'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function isValidStage(s: string): s is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(s);
}
