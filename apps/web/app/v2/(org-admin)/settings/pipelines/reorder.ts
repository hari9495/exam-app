// Pure helper for the settings/pipelines editor's up/down reorder buttons. The UI only ever moves
// an item one slot at a time (no drag-and-drop), so a "reorder" is always an adjacent swap -- this
// just picks out the pair whose `position` values need to trade places. The caller fires two
// mutations (one per item) with the swapped position values.
export interface Positioned {
  id: string;
  position: number;
}

export function swapAdjacent<T extends Positioned>(items: T[], index: number, direction: 'up' | 'down'): [T, T] | null {
  const otherIndex = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || otherIndex < 0 || otherIndex >= items.length) return null;
  return [items[index], items[otherIndex]];
}
