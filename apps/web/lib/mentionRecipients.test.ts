import { mentionRecipients } from './mentionRecipients';
import { UserGroupDirectoryEntry } from './types';

const directory: UserGroupDirectoryEntry[] = [
  { id: 'g1', name: 'Interviewers', memberIds: ['u1', 'u2'] },
  { id: 'g2', name: 'Hiring managers', memberIds: ['u2', 'u3'] },
  { id: 'g3', name: 'Empty group', memberIds: [] },
];

it('selecting a group adds its members', () => {
  expect(mentionRecipients([], ['g1'], directory).sort()).toEqual(['u1', 'u2']);
});

it('dedupes a group member already picked individually', () => {
  expect(mentionRecipients(['u1'], ['g1'], directory).sort()).toEqual(['u1', 'u2']);
});

it('dedupes members shared by two selected groups', () => {
  expect(mentionRecipients([], ['g1', 'g2'], directory).sort()).toEqual(['u1', 'u2', 'u3']);
});

it('deselecting a group removes only its exclusive members', () => {
  // g1+g2 selected: u1,u2,u3. Deselect g1 (drop from selectedGroupIds) -> u2 stays (via g2), u1 drops.
  const before = mentionRecipients([], ['g1', 'g2'], directory);
  expect(before.sort()).toEqual(['u1', 'u2', 'u3']);
  const after = mentionRecipients([], ['g2'], directory);
  expect(after.sort()).toEqual(['u2', 'u3']);
});

it('deselecting a group keeps a member who was also picked individually', () => {
  const after = mentionRecipients(['u1'], [], directory);
  expect(after).toEqual(['u1']);
});

it('empty group contributes nobody', () => {
  expect(mentionRecipients(['u9'], ['g3'], directory)).toEqual(['u9']);
});

it('result is deduped even with overlapping individual + group picks', () => {
  expect(mentionRecipients(['u2'], ['g1', 'g2'], directory).sort()).toEqual(['u1', 'u2', 'u3']);
});
