import { homeDueMonths, onlyUnfiled } from './statutory-filings.service';

// PAY-01 "Due this month" (founder 30 Oct 2026, item 13): unfiled dues are read back three months; of the older months
// only what is owed and not filed shows.
describe('Payroll home dues read back three months', () => {
  it('this month and the three before it, across a year end; the two oldest are unfiled-only', () => {
    expect(homeDueMonths('2026-10')).toEqual({ months: ['2026-07', '2026-08', '2026-09', '2026-10'], unfiledOnly: ['2026-07', '2026-08'] });
    expect(homeDueMonths('2027-02')).toEqual({ months: ['2026-11', '2026-12', '2027-01', '2027-02'], unfiledOnly: ['2026-11', '2026-12'] });
  });
  const hub = (cards: { statute: string; amount: string; status: string }[], tds = { amount: '0.00', challanStatus: 'not_prepared' }) => ({ month: '2026-07', cards, tds });
  it('keeps the unfiled items that owe something, drops filed and zero ones', () => {
    const [d] = onlyUnfiled(hub([{ statute: 'IN.PF', amount: '1200.00', status: 'generated' }, { statute: 'IN.ESI', amount: '300.00', status: 'filed' }, { statute: 'IN.PT', amount: '0.00', status: 'not_generated' }]));
    expect(d.cards.map((c) => c.statute)).toEqual(['IN.PF']);
  });
  it('a month with everything filed and TDS deposited is left out', () => {
    expect(onlyUnfiled(hub([{ statute: 'IN.PF', amount: '1200.00', status: 'filed' }], { amount: '5000.00', challanStatus: 'deposited' }))).toEqual([]);
    expect(onlyUnfiled(hub([]))).toEqual([]);
  });
  it('TDS not deposited keeps the month, even with every return filed', () => {
    const out = onlyUnfiled(hub([{ statute: 'IN.PF', amount: '1200.00', status: 'filed' }], { amount: '5000.00', challanStatus: 'prepared' }));
    expect(out).toHaveLength(1);
    expect(out[0].cards).toEqual([]);
  });
});
