import { parseRules, payStepsFor } from './time-core';

// G1 (gap pass T1): pay steps inside one leave type (data shape and calculator; the screen comes later).
describe('leave pay steps (G1, gap pass T1)', () => {
  const steps = [
    { days: 10, percent: 100 },
    { days: 20, percent: 50 },
  ];

  it('splits the days asked over the steps, after the days already taken in the window', () => {
    expect(payStepsFor(steps, 8, 6)).toEqual([
      { fromDay: 9, toDay: 10, days: 2, percent: 100 },
      { fromDay: 11, toDay: 14, days: 4, percent: 50 },
    ]);
    expect(payStepsFor(steps, 0, 3)).toEqual([{ fromDay: 1, toDay: 3, days: 3, percent: 100 }]);
  });

  it('days past the last step are unpaid', () => {
    expect(payStepsFor(steps, 28, 5)).toEqual([
      { fromDay: 29, toDay: 30, days: 2, percent: 50 },
      { fromDay: 31, toDay: 33, days: 3, percent: 0 },
    ]);
    expect(payStepsFor(steps, 40, 1)).toEqual([{ fromDay: 41, toDay: 41, days: 1, percent: 0 }]);
  });

  it('half days stay half days', () => {
    expect(payStepsFor(steps, 9.5, 1)).toEqual([
      { fromDay: 10, toDay: 10, days: 0.5, percent: 100 },
      { fromDay: 11, toDay: 10.5, days: 0.5, percent: 50 },
    ]);
  });

  it('the rules default to none and the leave year; a good shape is kept', () => {
    expect(parseRules({})).toMatchObject({ paySteps: null, payWindow: 'leave_year' });
    expect(parseRules({ paySteps: steps, payWindow: 'rolling_12_months' })).toMatchObject({ paySteps: steps, payWindow: 'rolling_12_months' });
  });

  it('refuses a bad shape in plain words', () => {
    expect(() => parseRules({ paySteps: [] })).toThrow(/1 to 5 pay steps/);
    expect(() => parseRules({ paySteps: Array(6).fill({ days: 1, percent: 100 }) })).toThrow(/1 to 5 pay steps/);
    expect(() => parseRules({ paySteps: [{ days: 0, percent: 100 }] })).toThrow(/0.5 to 366/);
    expect(() => parseRules({ paySteps: [{ days: 5, percent: 150 }] })).toThrow(/0 to 100/);
    expect(() => parseRules({ paySteps: [{ days: 5, percent: 50.5 }] })).toThrow(/whole percent/);
    expect(() => parseRules({ paySteps: [{ days: 5, percent: 50, rate: 1 }] })).toThrow(/expected shape/);
    expect(() => parseRules({ payWindow: 'month' })).toThrow(/leave year or the last 12 months/);
  });
});
