import type { JobListItem, Pipeline, StageCategory } from './types';

// The jobs list's pipeline summary (moved from the older /v2/jobs list, M10 AT1). Prefers the job's own pipeline stage
// names; falls back to the stage categories while pipelines load or for a removed pipeline.
const CATEGORY_ORDER: StageCategory[] = ['active', 'offer', 'hired', 'rejected', 'archived'];

export function stageSummary(job: JobListItem, pipelines: Pipeline[] | undefined): string {
  const pipeline = pipelines?.find((p) => p.id === job.pipelineId);
  if (pipeline) {
    const parts = pipeline.stages.map((s) => ({ label: s.name, count: job.stageCounts.byStageId[s.id] ?? 0 })).filter((e) => e.count > 0);
    if (parts.length > 0) return parts.map((e) => `${e.count} ${e.label}`).join(' · ');
  }
  const parts = CATEGORY_ORDER.map((c) => ({ label: c, count: job.stageCounts.byCategory[c] })).filter((e) => e.count > 0);
  return parts.length === 0 ? 'No candidates yet' : parts.map((e) => `${e.count} ${e.label}`).join(' · ');
}
