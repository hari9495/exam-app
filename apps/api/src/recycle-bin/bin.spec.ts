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

describe('recycle bin wave 2: child rows (answer 2439)', () => {
  const { toBin, revive, CHILDREN_KEY } = jest.requireActual('./bin') as typeof import('./bin');

  it('keeps the children under their model and refuses a model the kind does not own', async () => {
    const create = jest.fn();
    const tx = { recycleBinItem: { create } } as never;
    await toBin(tx, { organizationId: 'o', userId: 'u' }, 'user_group', { id: 'g', name: 'Panel' }, 'Panel', { userGroupMember: [{ id: 'm', groupId: 'g' }] });
    expect(create.mock.calls[0][0].data.data).toEqual({ id: 'g', name: 'Panel', [CHILDREN_KEY]: { userGroupMember: [{ id: 'm', groupId: 'g' }] } });
    await expect(toBin(tx, { organizationId: 'o' }, 'user_group', { id: 'g' }, 'x', { user: [{ id: 'u' }] })).rejects.toThrow(/keeps no user rows/);
  });

  it('turns stored big numbers back into BigInt and leaves out empty JSON fields', () => {
    const line = revive('staffingInvoiceLine', { id: 'l', ratePaise: '150000', amountPaise: '300000', qtyCenti: 200 });
    expect(line).toEqual({ id: 'l', ratePaise: BigInt(150000), amountPaise: BigInt(300000), qtyCenti: 200 });
  });
});
