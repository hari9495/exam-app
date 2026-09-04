import { swapAdjacent } from './reorder';

const items = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 },
];

it('pairs an item with its predecessor when moving up', () => {
  expect(swapAdjacent(items, 1, 'up')).toEqual([items[1], items[0]]);
});

it('pairs an item with its successor when moving down', () => {
  expect(swapAdjacent(items, 1, 'down')).toEqual([items[1], items[2]]);
});

it('returns null moving the first item up', () => {
  expect(swapAdjacent(items, 0, 'up')).toBeNull();
});

it('returns null moving the last item down', () => {
  expect(swapAdjacent(items, 2, 'down')).toBeNull();
});

it('returns null for an out-of-range index', () => {
  expect(swapAdjacent(items, 5, 'up')).toBeNull();
  expect(swapAdjacent(items, -1, 'down')).toBeNull();
});

it('returns null for a single-item list', () => {
  expect(swapAdjacent([items[0]], 0, 'up')).toBeNull();
  expect(swapAdjacent([items[0]], 0, 'down')).toBeNull();
});
