import { collectChecklistItems } from './blueprintChecklist';
import { PipelineStageConfig } from './types';

function stage(overrides: Partial<PipelineStageConfig>): PipelineStageConfig {
  return { id: 's', name: 'Stage', category: 'active', position: 0, statuses: [], ...overrides };
}

it('returns [] when no stage has a checklist rule', () => {
  const stages = [stage({ rules: [{ id: 'r1', type: 'exam_passed' }] }), stage({ id: 's2' })];
  expect(collectChecklistItems(stages)).toEqual([]);
});

it('returns [] when stages have no rules at all', () => {
  expect(collectChecklistItems([stage({})])).toEqual([]);
});

it('aggregates checklist items across stages, tagging each with its stage name', () => {
  const stages = [
    stage({
      id: 's1',
      name: 'Screen',
      rules: [{ id: 'r1', type: 'checklist', items: [{ id: 'bg-check', label: 'Background check' }] }],
    }),
    stage({
      id: 's2',
      name: 'Offer',
      rules: [{ id: 'r2', type: 'checklist', items: [{ id: 'refs', label: 'References' }] }],
    }),
  ];
  expect(collectChecklistItems(stages)).toEqual([
    { id: 'bg-check', label: 'Background check', stageName: 'Screen' },
    { id: 'refs', label: 'References', stageName: 'Offer' },
  ]);
});

it('dedupes by item id, keeping the first occurrence', () => {
  const stages = [
    stage({ id: 's1', name: 'Screen', rules: [{ id: 'r1', type: 'checklist', items: [{ id: 'refs', label: 'References' }] }] }),
    stage({ id: 's2', name: 'Offer', rules: [{ id: 'r2', type: 'checklist', items: [{ id: 'refs', label: 'References (dup)' }] }] }),
  ];
  expect(collectChecklistItems(stages)).toEqual([{ id: 'refs', label: 'References', stageName: 'Screen' }]);
});

it('ignores non-checklist rules mixed in with checklist rules', () => {
  const stages = [
    stage({
      id: 's1',
      name: 'Screen',
      rules: [
        { id: 'r1', type: 'feedback', minCount: 1 },
        { id: 'r2', type: 'checklist', items: [{ id: 'bg-check', label: 'Background check' }] },
      ],
    }),
  ];
  expect(collectChecklistItems(stages)).toEqual([{ id: 'bg-check', label: 'Background check', stageName: 'Screen' }]);
});
