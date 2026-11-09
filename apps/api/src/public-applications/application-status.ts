// Candidate-facing translation of the internal pipeline stage. Rejected wins over stage so a
// rejected candidate never sees a stage label. Never expose the raw stage to candidates.
// T9-09: YukthiX pipelines name stages freely, so the stage's category (and whether an earlier active stage exists)
// decides when the name is not one of the older fixed ones.
export function applicationStatusBucket(stage: string, rejected: boolean, info?: { category: string; later: boolean }): string {
  if (rejected || info?.category === 'rejected' || info?.category === 'archived') return 'A decision has been made; the team will follow up';
  if (info?.category === 'offer' || info?.category === 'hired') return 'Moving forward — the team will be in touch';
  switch (stage) {
    case 'applied':
      return 'Application received';
    case 'screened':
    case 'interview':
      return 'Under review';
    case 'offer':
    case 'hired':
      return 'Moving forward — the team will be in touch';
    default:
      return info?.later ? 'Under review' : 'Application received';
  }
}

/** The select that feeds applicationStatusBucket: the stage, its category and the pipeline's first active stage. */
export const STAGE_FOR_BUCKET = {
  select: { stage: { select: { name: true, category: true, position: true, pipeline: { select: { stages: { where: { category: 'active' }, orderBy: { position: 'asc' as const }, take: 1, select: { position: true } } } } } } },
};

export function bucketOf(status: { stage: { name: string; category: string; position: number; pipeline: { stages: { position: number }[] } } } | null, rejected: boolean): string {
  if (!status) return applicationStatusBucket('', rejected);
  const s = status.stage;
  const first = s.pipeline.stages[0]?.position;
  return applicationStatusBucket(s.name, rejected, { category: s.category, later: first !== undefined && s.position > first });
}
