import { MIN_GROUP, figures, monthEnds, splitBy, type ExitRow, type HeadRow } from './attrition';
import { period } from './attrition.service';

jest.mock('../org-structure/org-validation', () => ({ ...jest.requireActual('../org-structure/org-validation'), todayIst: () => '2026-11-27' }));

const head = (day: string, department: string, n: number): HeadRow[] => Array.from({ length: n }, () => ({ day, entity: 'e', department, location: 'l', grade: null }));
const exit = (department: string, initiatedBy: ExitRow['initiatedBy']): ExitRow => ({ entity: 'e', department, location: 'l', grade: null, initiatedBy });

describe('headcount and attrition (T2-G 47)', () => {
  it('month ends: the last day of each month, leap years and year ends included', () => {
    expect(monthEnds('2027-12', '2028-03')).toEqual(['2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31']);
    expect(monthEnds('2026-05', '2026-04')).toEqual([]);
  });

  it('attrition = exits ÷ average month-end headcount; voluntary, involuntary and not recorded', () => {
    const days = ['2026-01-31', '2026-02-28'];
    const heads = [...head(days[0]!, 'ops', 20), ...head(days[1]!, 'ops', 30)];
    const f = figures(days, heads, [exit('ops', 'employee'), exit('ops', 'employee'), exit('ops', 'company'), exit('ops', null)]);
    expect(f).toEqual({ avgHeadcount: 25, exits: 4, voluntary: 2, involuntary: 1, notRecorded: 1, rate: 16, voluntaryRate: 8 });
    expect(figures(days, [], []).rate).toBeNull();
  });

  it(`a group with an average under ${MIN_GROUP} people shows no numbers`, () => {
    const days = ['2026-01-31'];
    const heads = [...head(days[0]!, 'ops', 12), ...head(days[0]!, 'hr', 4)];
    const out = splitBy('department', days, heads, [exit('hr', 'employee'), exit('ops', 'company')]);
    expect(out.find((g) => g.id === 'hr')).toEqual({ id: 'hr', hidden: true });
    expect(out.find((g) => g.id === 'ops')).toEqual(expect.objectContaining({ hidden: false, avgHeadcount: 12, exits: 1, involuntary: 1 }));
    expect(JSON.stringify(out.find((g) => g.id === 'hr'))).not.toMatch(/exits|avg/);
  });

  it('the period: the last 12 complete months by default; never ahead, backwards or longer than 24 months', () => {
    expect(period()).toEqual({ from: '2025-11', to: '2026-10' });
    expect(period('2026-01', '2026-11')).toEqual({ from: '2026-01', to: '2026-11' });
    expect(() => period('2026-05', '2026-04')).toThrow(/starts after/);
    expect(() => period('2026-01', '2026-12')).toThrow(/up to this month/);
    expect(() => period('2024-01', '2026-01')).toThrow(/24 months/);
  });
});
