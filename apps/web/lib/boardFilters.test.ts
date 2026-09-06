import { isInMyTeam } from './boardFilters';
import { BoardEntryRow } from './types';

function row(overrides: Partial<BoardEntryRow>): BoardEntryRow {
  return {
    entryId: 'e1',
    candidateId: 'c1',
    candidateName: 'Cand',
    candidateEmail: 'cand@example.com',
    statusId: 's1',
    stageId: 'st1',
    category: 'active',
    enteredVia: 'manual',
    rejectedReason: null,
    examResults: [],
    avgRating: null,
    feedbackCount: 0,
    fitScore: null,
    fitStatus: null,
    fitStale: false,
    assignedUserId: null,
    assigneeName: null,
    assignedGroupId: null,
    assignedGroupName: null,
    ...overrides,
  };
}

const myGroups = { groupIds: ['g1'], coMemberUserIds: ['u2'] };

it('is my team when the row is assigned to a group I am in', () => {
  expect(isInMyTeam(row({ assignedGroupId: 'g1' }), 'u1', myGroups)).toBe(true);
});

it('is not my team when assigned to a group I am not in', () => {
  expect(isInMyTeam(row({ assignedGroupId: 'g2' }), 'u1', myGroups)).toBe(false);
});

it('is my team when assigned to myself directly', () => {
  expect(isInMyTeam(row({ assignedUserId: 'u1' }), 'u1', myGroups)).toBe(true);
});

it('is my team when assigned to a co-member teammate', () => {
  expect(isInMyTeam(row({ assignedUserId: 'u2' }), 'u1', myGroups)).toBe(true);
});

it('is not my team when assigned to an unrelated user', () => {
  expect(isInMyTeam(row({ assignedUserId: 'u3' }), 'u1', myGroups)).toBe(false);
});

it('is not my team when unassigned', () => {
  expect(isInMyTeam(row({}), 'u1', myGroups)).toBe(false);
});

it('is false (not thrown) while myGroups has not loaded yet', () => {
  expect(isInMyTeam(row({ assignedGroupId: 'g1' }), 'u1', undefined)).toBe(false);
  expect(isInMyTeam(row({ assignedUserId: 'u2' }), 'u1', undefined)).toBe(false);
});
