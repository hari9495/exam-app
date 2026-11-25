import { entitledMonths, flexBalance, flexSettle, flexYearMonths, flexYearOf } from './flex';

// B8/E5 (founder answers 2406, 2407): the money rules of flexible benefits at their edges.
describe('flexible benefits: the year and the months', () => {
  it('the tax year runs April to March', () => {
    expect(flexYearOf('2026-04')).toBe('2026-27');
    expect(flexYearOf('2027-03')).toBe('2026-27');
    expect(flexYearOf('2027-04')).toBe('2027-28');
    expect(flexYearOf('2099-12')).toBe('2099-00');
    expect(flexYearMonths('2026-27')).toEqual({ first: '2026-04', last: '2027-03' });
  });

  it('months employed: a whole year is 12; a joiner from the joining month; a leaver to the exit month; never past "through"', () => {
    expect(entitledMonths('2026-27', '2020-01-15', null, '2027-03')).toBe(12);
    expect(entitledMonths('2026-27', '2020-01-15', null, '2026-11')).toBe(8);
    expect(entitledMonths('2026-27', '2026-11-30', null, '2027-03')).toBe(5);
    expect(entitledMonths('2026-27', '2020-01-15', '2026-06-01', '2027-03')).toBe(3);
    expect(entitledMonths('2026-27', '2026-04-01', '2026-04-01', '2027-03')).toBe(1);
    // Joined after "through", or left before the year: nothing.
    expect(entitledMonths('2026-27', '2027-01-10', null, '2026-12')).toBe(0);
    expect(entitledMonths('2026-27', '2020-01-15', '2026-03-31', '2027-03')).toBe(0);
  });
});

describe('flexible benefits: the balance', () => {
  it('entitled is the monthly amount × months; available takes off claimed and waiting claims, adds carried in', () => {
    expect(flexBalance({ monthly: '1500', months: 8, carriedIn: '0', claimed: '0' })).toEqual({ entitled: expect.anything(), available: expect.anything() });
    const b = flexBalance({ monthly: '1666.67', months: 12, carriedIn: '250.50', claimed: '10000', pending: '999.99' });
    expect(b.entitled.toFixed(2)).toBe('20000.04');
    expect(b.available.toFixed(2)).toBe('9250.55');
    // Exactly at the balance leaves zero; a paisa more is below zero (the claim check refuses it).
    expect(flexBalance({ monthly: '1000', months: 3, carriedIn: '0', claimed: '3000' }).available.toFixed(2)).toBe('0.00');
    expect(flexBalance({ monthly: '1000', months: 3, carriedIn: '0', claimed: '3000.01' }).available.toFixed(2)).toBe('-0.01');
  });
});

describe('flexible benefits: settling what is left (answer 2406)', () => {
  const base = { entitled: '18000', carriedIn: '0', claimed: '12500.50', carryForward: false, taxableIfUnclaimed: true };
  const text = (s: ReturnType<typeof flexSettle>) => [s.paidTaxable.toFixed(2), s.carriedOut.toFixed(2), s.lapsed.toFixed(2)];

  it('March, carry forward off (the default): what is left is paid as taxable salary', () => {
    expect(text(flexSettle({ ...base, kind: 'year_end' }))).toEqual(['5499.50', '0.00', '0.00']);
  });

  it('March, carry forward on: carried into next year, nothing paid', () => {
    expect(text(flexSettle({ ...base, kind: 'year_end', carryForward: true }))).toEqual(['0.00', '5499.50', '0.00']);
  });

  it('exit: always paid, even with carry forward on; carried in counts', () => {
    expect(text(flexSettle({ ...base, kind: 'exit', carryForward: true, carriedIn: '1000' }))).toEqual(['6499.50', '0.00', '0.00']);
  });

  it('not taxable if unclaimed: what is left lapses', () => {
    expect(text(flexSettle({ ...base, kind: 'year_end', taxableIfUnclaimed: false }))).toEqual(['0.00', '0.00', '5499.50']);
  });

  it('all claimed (or more): nothing to pay, never negative', () => {
    expect(text(flexSettle({ ...base, claimed: '18000', kind: 'year_end' }))).toEqual(['0.00', '0.00', '0.00']);
    expect(text(flexSettle({ ...base, claimed: '18000.01', kind: 'exit' }))).toEqual(['0.00', '0.00', '0.00']);
  });
});
