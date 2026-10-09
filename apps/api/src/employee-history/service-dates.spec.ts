import { serviceDates, Spell } from './service-dates';

// G1 (gap pass C3): company start, this employer's start and continuous service from.
const spell = (p: Partial<Spell> & Pick<Spell, 'id' | 'joinedOn'>): Spell => ({ exitedOn: null, rehireOf: null, continuousServiceFrom: null, serviceChoice: null, ...p });

describe('service dates (G1, gap pass C3)', () => {
  const first = spell({ id: 'a', joinedOn: '2020-01-01', exitedOn: '2022-12-31' });

  it('a first spell: all three dates are the joining day', () => {
    expect(serviceDates([spell({ id: 'a', joinedOn: '2024-04-01' })], 'a')).toEqual({ companyStart: '2024-04-01', employerStart: '2024-04-01', continuousServiceFrom: '2024-04-01', source: 'joining' });
  });

  it('a rehire with a fresh start keeps the company start and counts service from the new joining day', () => {
    const d = serviceDates([first, spell({ id: 'b', joinedOn: '2024-01-01', rehireOf: 'a', serviceChoice: 'fresh' })], 'b');
    expect(d).toEqual({ companyStart: '2020-01-01', employerStart: '2024-01-01', continuousServiceFrom: '2024-01-01', source: 'joining' });
  });

  it('continuous: service runs from the first joining day', () => {
    expect(serviceDates([first, spell({ id: 'b', joinedOn: '2024-01-01', rehireOf: 'a', serviceChoice: 'continuous' })], 'b').continuousServiceFrom).toBe('2020-01-01');
  });

  it('break counted: the days served before move the start back (the break does not count)', () => {
    // 2020-01-01..2022-12-31 is 1,096 days; back from 2024-01-01 gives 2020-12-31.
    const d = serviceDates([first, spell({ id: 'b', joinedOn: '2024-01-01', rehireOf: 'a', serviceChoice: 'break_counted' })], 'b');
    expect(d).toMatchObject({ continuousServiceFrom: '2020-12-31', source: 'rehire_break_counted' });
  });

  it('chains through two rehires, and HR’s value wins anywhere in the chain', () => {
    const b = spell({ id: 'b', joinedOn: '2023-06-01', exitedOn: '2024-05-31', rehireOf: 'a', serviceChoice: 'continuous' });
    const c = spell({ id: 'c', joinedOn: '2025-01-01', rehireOf: 'b', serviceChoice: 'continuous' });
    expect(serviceDates([first, b, c], 'c').continuousServiceFrom).toBe('2020-01-01');
    const hr = { ...b, continuousServiceFrom: '2019-01-01' };
    expect(serviceDates([first, hr, c], 'c')).toMatchObject({ continuousServiceFrom: '2019-01-01', source: 'rehire_continuous' });
    expect(serviceDates([first, b, { ...c, continuousServiceFrom: '2024-12-01' }], 'c')).toMatchObject({ continuousServiceFrom: '2024-12-01', source: 'hr' });
  });

  it('a broken chain counts from the joining day, never an invented date', () => {
    expect(serviceDates([spell({ id: 'b', joinedOn: '2024-01-01', rehireOf: 'gone', serviceChoice: 'continuous' })], 'b').continuousServiceFrom).toBe('2024-01-01');
  });
});
