export const DEFAULT_PIPELINE_STAGES = [
  { key: 'applied', category: 'active' },
  { key: 'screened', category: 'active' },
  { key: 'interview', category: 'active' },
  { key: 'offer', category: 'offer' },
  { key: 'hired', category: 'hired' },
  { key: 'rejected', category: 'rejected' },
] as const;

export function legacyStageToSeededStageKey(stage: string, rejected: boolean): string {
  if (rejected) return 'rejected';
  const found = DEFAULT_PIPELINE_STAGES.find((s) => s.key === stage);
  return found ? found.key : 'applied';
}
