import { chainReducer, type EditorStep } from './ChainEditor';

const s0: EditorStep[] = [{ name: 'A', approverType: 'users', approverUserIds: ['u1'], managerLevel: null }];

it('adds, reorders, and normalizes positions', () => {
  const added = chainReducer(s0, { type: 'add' });
  expect(added).toHaveLength(2);
  expect(added[1]).toEqual({ name: '', approverType: 'users', approverUserIds: [], managerLevel: null });

  const moved = chainReducer([{ ...s0[0], name: 'A' }, { ...s0[0], name: 'B' }], { type: 'move', from: 1, to: 0 });
  expect(moved.map((s) => s.name)).toEqual(['B', 'A']);
});

it('removes a step by index', () => {
  const two: EditorStep[] = [s0[0], { ...s0[0], name: 'B' }];
  expect(chainReducer(two, { type: 'remove', index: 0 }).map((s) => s.name)).toEqual(['B']);
});

it('edits a step in place, merging the patch', () => {
  const edited = chainReducer(s0, { type: 'edit', index: 0, patch: { approverType: 'reporting_manager', managerLevel: 1 } });
  expect(edited[0]).toEqual({ name: 'A', approverType: 'reporting_manager', approverUserIds: ['u1'], managerLevel: 1 });
});

it('is pure: never mutates the input array or its items', () => {
  const before = JSON.stringify(s0);
  chainReducer(s0, { type: 'edit', index: 0, patch: { name: 'Z' } });
  chainReducer(s0, { type: 'remove', index: 0 });
  chainReducer(s0, { type: 'add' });
  expect(JSON.stringify(s0)).toEqual(before);
});
