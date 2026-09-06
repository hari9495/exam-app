import { PipelineStageConfig } from './types';

// Pure helper for CandidateDrawer's checklist card. Extracted dependency-free (no drawer import)
// so it can be unit-tested without pulling in @tanstack/react-table via CandidateDrawer.tsx --
// mirrors settings/pipelines/reorder.ts's pattern.
export interface ChecklistItem {
  id: string;
  label: string;
  stageName: string;
}

// Aggregates every 'checklist' rule's items across a pipeline's stages, tagging each with the
// stage it belongs to. An item id can appear on more than one stage's checklist rule; only the
// first occurrence is kept (dedupe by id) since the drawer ticks by item id, not by stage.
export function collectChecklistItems(stages: PipelineStageConfig[]): ChecklistItem[] {
  const seen = new Set<string>();
  const items: ChecklistItem[] = [];
  for (const stage of stages) {
    for (const rule of stage.rules ?? []) {
      if (rule.type !== 'checklist') continue;
      for (const item of rule.items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push({ id: item.id, label: item.label, stageName: stage.name });
      }
    }
  }
  return items;
}
