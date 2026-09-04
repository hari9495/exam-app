import type { StageCategory } from './pipeline-categories';

export const GLOBAL_STAGES = ['new', 'in_review', 'engaged', 'available', 'offered', 'hired', 'rejected'] as const;
export type GlobalStage = (typeof GLOBAL_STAGES)[number];

export interface GlobalStageEntry {
  category: StageCategory;
  archived: boolean;
}

// Idempotent derivation of a candidate's global stage from their pipeline entries.
// An archived entry (archivedAt set) is "freed" -- it no longer counts toward
// active/offer/hired, but it does make the candidate re-engageable (available).
export function deriveGlobalStage(entries: GlobalStageEntry[], contacted: boolean): GlobalStage {
  const live = entries.filter((e) => !e.archived);
  if (live.some((e) => e.category === 'hired')) return 'hired';
  if (live.some((e) => e.category === 'offer')) return 'offered';
  if (live.some((e) => e.category === 'active')) return 'engaged';
  if (entries.some((e) => e.archived)) return 'available';
  if (live.some((e) => e.category === 'rejected')) return 'rejected';
  return contacted ? 'in_review' : 'new';
}
