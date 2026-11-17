import { DEFAULT_KEEP_DAYS, keepDays, snapshot } from './bin';

describe('recycle bin helpers (batch B item 3)', () => {
  it('keeps a row as plain JSON: dates as ISO strings, big numbers as strings', () => {
    expect(snapshot({ id: 'x', at: new Date('2026-11-17T00:00:00Z'), seq: BigInt(5), name: 'A' })).toEqual({ id: 'x', at: '2026-11-17T00:00:00.000Z', seq: '5', name: 'A' });
  });

  it.each([
    [undefined, DEFAULT_KEEP_DAYS],
    ['30', 30],
    [365, 365],
    ['junk', DEFAULT_KEEP_DAYS],
    ['0', DEFAULT_KEEP_DAYS],
  ])('keep days from the company setting %p is %p', async (value, days) => {
    const tx = { setting: { findFirst: jest.fn().mockResolvedValue(value === undefined ? null : { value }) } } as never;
    expect(await keepDays(tx, 'org-1')).toBe(days);
  });
});
