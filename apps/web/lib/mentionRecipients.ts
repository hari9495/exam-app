import { UserGroupDirectoryEntry } from './types';

// Merges individually-picked mention/notify user ids with the members of selected groups.
// Pure + dependency-free (no component imports) so it's unit-testable without pulling in
// CandidateDrawer's heavy component tree (@tanstack/react-table), which jest here doesn't
// transform. Recomputed fresh from (individualIds, selectedGroupIds) on every toggle, so
// deselecting a group naturally keeps members still contributed by another selected group or
// an individual pick — no separate removal bookkeeping needed.
export function mentionRecipients(
  individualIds: string[],
  selectedGroupIds: string[],
  directory: UserGroupDirectoryEntry[],
): string[] {
  const ids = new Set(individualIds);
  for (const groupId of selectedGroupIds) {
    const group = directory.find((g) => g.id === groupId);
    group?.memberIds.forEach((id) => ids.add(id));
  }
  return [...ids];
}
