import { recomputeGlobalStage } from './recompute-global-stage';

function fakeTx(entries: any[], emailCount: number) {
  return {
    pipelineEntry: { findMany: jest.fn().mockResolvedValue(entries) },
    candidateEmail: { count: jest.fn().mockResolvedValue(emailCount) },
    candidate: { update: jest.fn().mockResolvedValue({}) },
  } as any;
}

it('writes engaged for a live active entry', async () => {
  const tx = fakeTx([{ archivedAt: null, status: { stage: { category: 'active' } } }], 0);
  const result = await recomputeGlobalStage(tx, 'org-1', 'cand-1');
  expect(result).toBe('engaged');
  expect(tx.candidate.update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { globalStage: 'engaged' } });
});

it('writes available when the only entry is archived', async () => {
  const tx = fakeTx([{ archivedAt: new Date(), status: { stage: { category: 'active' } } }], 0);
  expect(await recomputeGlobalStage(tx, 'org-1', 'cand-1')).toBe('available');
});

it('writes in_review for a contacted candidate with no entries', async () => {
  const tx = fakeTx([], 2);
  expect(await recomputeGlobalStage(tx, 'org-1', 'cand-1')).toBe('in_review');
});
