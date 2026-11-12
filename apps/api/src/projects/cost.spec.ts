import { costShown, marginPct, monthCost, restatedFrom } from './cost';

describe('project cost (PRJ-04, answers 1412, 1413)', () => {
  it('approved minutes times each person’s rate, whole paise; final only when every rate is the month’s own', () => {
    const rates: Record<string, { rate: number; final: boolean }> = { a: { rate: 500, final: true }, b: { rate: 312.5, final: true } };
    expect(monthCost([{ employeeId: 'a', minutes: 600 }, { employeeId: 'b', minutes: 90 }], (e) => rates[e]!)).toEqual({ costPaise: 500000 + 46875, minutes: 690, people: 2, basis: 'final' });
    expect(monthCost([{ employeeId: 'a', minutes: 60 }], () => ({ rate: 500, final: false })).basis).toBe('provisional');
    expect(monthCost([{ employeeId: 'a', minutes: 60 }, { employeeId: 'x', minutes: 60 }], (e) => (e === 'a' ? rates.a! : null))).toMatchObject({ costPaise: 50000, people: 2, basis: 'provisional' });
    expect(monthCost([{ employeeId: 'a', minutes: 0 }], () => rates.a!)).toEqual({ costPaise: 0, minutes: 0, people: 0, basis: 'final' });
  });

  it('a provisional month restated when it becomes final with another total; kept once restated', () => {
    expect(restatedFrom({ basis: 'provisional', costPaise: 100n, restatedFromPaise: null }, { basis: 'final', costPaise: 120 })).toBe(100n);
    expect(restatedFrom({ basis: 'provisional', costPaise: 120n, restatedFromPaise: null }, { basis: 'final', costPaise: 120 })).toBeNull();
    expect(restatedFrom({ basis: 'final', costPaise: 120n, restatedFromPaise: 100n }, { basis: 'final', costPaise: 120 })).toBe(100n);
    expect(restatedFrom(null, { basis: 'final', costPaise: 120 })).toBeNull();
  });

  it('who sees cost: finance always; a project manager only with enough people; others never', () => {
    expect(costShown({ finance: true, manager: false, people: 1, minPeople: 2 })).toBe(true);
    expect(costShown({ finance: false, manager: true, people: 1, minPeople: 2 })).toBe(false);
    expect(costShown({ finance: false, manager: true, people: 2, minPeople: 2 })).toBe(true);
    expect(costShown({ finance: false, manager: false, people: 9, minPeople: 2 })).toBe(false);
    expect(marginPct(10000, 7500)).toBe(25);
    expect(marginPct(0, 10)).toBeNull();
  });
});
