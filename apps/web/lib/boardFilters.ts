import { BoardEntryRow, MyGroups } from './types';

// A row counts as "my team's" if it's assigned to a group I'm in, or to a teammate who
// co-shares a group with me (or to me directly). Pure + dependency-free (no component imports)
// so it's unit-testable without pulling in PipelineBoard's heavy component tree (DataTable /
// @tanstack/react-table, which jest here doesn't transform). myGroups is undefined while
// useMyGroups() is still loading.
export function isInMyTeam(row: BoardEntryRow, currentUserId: string | undefined, myGroups: MyGroups | undefined): boolean {
  if (row.assignedGroupId && myGroups?.groupIds.includes(row.assignedGroupId)) return true;
  if (row.assignedUserId && (row.assignedUserId === currentUserId || myGroups?.coMemberUserIds.includes(row.assignedUserId))) return true;
  return false;
}
