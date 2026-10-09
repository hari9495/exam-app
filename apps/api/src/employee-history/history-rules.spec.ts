import { affectedMonths, applyFact, fold, FoldError, fyStart, localToday, payloadProblem, reach, AssignmentValues, CompensationValues } from './history-rules';

// P06 rules that need no database: change types (M01 §3.3), the fold that turns changes into dated rows
// (§4.3, §4.4, YX-HIS-06), retro reach (YX-HIS-12) and affected periods (§4.5).
const A: AssignmentValues = { locationId: 'loc', departmentId: 'dep', designationId: 'des', gradeId: 'g1', skillClass: null, employmentTypeId: 'et', managerEmployeeId: 'm1', costCentres: [], dottedLineManagerIds: [] };

describe('change types (M01 §3.3)', () => {
  it('each type changes only its own facts', () => {
    expect(payloadProblem('promotion', { assignment: { designationId: 'x', gradeId: 'g2' }, compensation: { annualCtc: '780000' } })).toBeNull();
    expect(payloadProblem('promotion', { assignment: { locationId: 'x' } })).toMatch(/cannot change locationId/);
    expect(payloadProblem('manager_change', { assignment: { managerEmployeeId: 'm2' }, compensation: { annualCtc: '1' } })).toMatch(/cannot change pay/);
    expect(payloadProblem('transfer', { status: 'confirmed', assignment: { locationId: 'x' } })).toMatch(/cannot change the employment status/);
    expect(payloadProblem('confirmation', { status: 'probation' })).toMatch(/cannot set the status to probation/);
    expect(payloadProblem('salary_revision', { assignment: { designationId: 'x' } })).toMatch(/must set the compensation/);
    expect(payloadProblem('correction', { assignment: { locationId: 'x' }, status: 'notice', compensation: { annualCtc: '1' } })).toBeNull();
  });

  it('a join carries a complete assignment and a status, and gives pay as an amount', () => {
    expect(payloadProblem('join', { assignment: { locationId: 'l' }, status: 'probation' })).toMatch(/needs departmentId/);
    expect(payloadProblem('join', { assignment: A, status: 'probation', compensation: { increasePercent: '5' } })).toMatch(/not an increase/);
    expect(payloadProblem('join', { assignment: A })).toMatch(/must set the status/);
    expect(payloadProblem('join', { assignment: A, status: 'confirmed' })).toBeNull();
  });

  it('pay is either an amount or a percentage; cost centres total 100 % once each (P01 Q8)', () => {
    expect(payloadProblem('salary_revision', { compensation: {} })).toMatch(/either/);
    expect(payloadProblem('salary_revision', { compensation: { annualCtc: '1', increasePercent: '2' } })).toMatch(/either/);
    expect(payloadProblem('transfer', { assignment: { costCentres: [{ costCentreId: 'a', percent: '60' }, { costCentreId: 'b', percent: '30' }] } })).toMatch(/total 100/);
    expect(payloadProblem('transfer', { assignment: { costCentres: [{ costCentreId: 'a', percent: '50' }, { costCentreId: 'a', percent: '50' }] } })).toMatch(/twice/);
    expect(payloadProblem('transfer', { assignment: { costCentres: [{ costCentreId: 'a', percent: '33.34' }, { costCentreId: 'b', percent: '66.66' }] } })).toBeNull();
    expect(payloadProblem('transfer', { assignment: {} })).toMatch(/sets nothing/);
  });
});

describe('the fold (P06 §4.3, §4.4)', () => {
  const join = { id: 'join', effectiveDate: '2026-04-01', payload: { assignment: A } };

  it('each change closes the previous segment the day before it starts; untouched fields carry over', () => {
    const segs = fold<AssignmentValues>('assignment', null, [join, { id: 'p', effectiveDate: '2026-10-01', payload: { assignment: { designationId: 'lead' } } }]);
    expect(segs.map((s) => [s.from, s.to, s.changeId, s.values.designationId, s.values.locationId])).toEqual([
      ['2026-04-01', '2026-09-30', 'join', 'des', 'loc'],
      ['2026-10-01', null, 'p', 'lead', 'loc'],
    ]);
  });

  it('continues the row in force before the first change, and ignores changes to other facts', () => {
    const initial = { from: '2024-07-01', to: null, changeId: 'join', values: A };
    expect(fold('assignment', initial, [{ id: 'r', effectiveDate: '2026-04-01', payload: { compensation: { annualCtc: '1' } } }])).toEqual([{ ...initial }]);
  });

  it('same-day changes collapse into one segment owned by the last raised (a correction wins)', () => {
    const segs = fold<AssignmentValues>('assignment', null, [join, { id: 'fix', effectiveDate: '2026-04-01', payload: { assignment: { designationId: 'lab' } } }]);
    expect(segs).toEqual([{ from: '2026-04-01', to: null, changeId: 'fix', values: { ...A, designationId: 'lab' } }]);
  });

  it('YX-HIS-06: a percentage increase is applied to whatever base is in force on its date (rebase)', () => {
    const base = { id: 'join', effectiveDate: '2026-04-01', payload: { compensation: { currency: 'INR', annualCtc: '600000' } } };
    const increment = { id: 'inc', effectiveDate: '2026-11-01', payload: { compensation: { increasePercent: '10' } } };
    expect(fold<CompensationValues>('compensation', null, [base, increment]).map((s) => s.values.annualCtc)).toEqual(['600000.00', '660000.00']);
    // A revision inserted before it: the increment keeps its 10 % on the new base.
    const revision = { id: 'rev', effectiveDate: '2026-10-15', payload: { compensation: { annualCtc: '700000' } } };
    expect(fold<CompensationValues>('compensation', null, [base, revision, increment]).map((s) => [s.from, s.to, s.values.annualCtc])).toEqual([
      ['2026-04-01', '2026-10-14', '600000.00'],
      ['2026-10-15', '2026-10-31', '700000.00'],
      ['2026-11-01', null, '770000.00'],
    ]);
  });

  it('decimal pay maths rounds half up to paise; a negative percentage is a recovery', () => {
    expect(applyFact('compensation', { currency: 'INR', annualCtc: '333333.33' }, { compensation: { increasePercent: '3.33' } })).toEqual({ currency: 'INR', annualCtc: '344433.33' });
    expect(applyFact('compensation', { currency: 'INR', annualCtc: '100000.00' }, { compensation: { increasePercent: '-5' } })).toEqual({ currency: 'INR', annualCtc: '95000.00' });
  });

  it('an increase needs a base in the same currency; an assignment change needs an assignment', () => {
    expect(() => applyFact('compensation', null, { compensation: { increasePercent: '5' } })).toThrow(FoldError);
    expect(() => applyFact('compensation', { currency: 'INR', annualCtc: '1.00' }, { compensation: { currency: 'USD', increasePercent: '5' } })).toThrow(/currency/);
    expect(() => applyFact('assignment', null, { assignment: { designationId: 'x' } })).toThrow(FoldError);
  });

  it('cost-centre shares are stored sorted with two decimals, so equal splits compare equal', () => {
    const v = applyFact('assignment', A, { assignment: { costCentres: [{ costCentreId: 'b', percent: '40' }, { costCentreId: 'a', percent: '60.0' }] } }) as AssignmentValues;
    expect(v.costCentres).toEqual([{ costCentreId: 'a', percent: '60.00' }, { costCentreId: 'b', percent: '40.00' }]);
  });
});

describe('retro reach and affected periods (YX-HIS-12, P06 §4.5)', () => {
  it('the limit is the start of the financial year, or the one before when the company widens it', () => {
    expect(fyStart('2026-10-06', 4)).toBe('2026-04-01');
    expect(fyStart('2026-02-10', 4)).toBe('2025-04-01');
    expect(fyStart('2026-10-06', 1)).toBe('2026-01-01');
    expect(fyStart('2026-10-06', 4, 1)).toBe('2025-04-01');
  });

  it('future (today or later), retro (inside the limit) or before the limit', () => {
    expect(reach('2026-10-06', '2026-10-06', '2026-04-01')).toBe('future');
    expect(reach('2026-11-01', '2026-10-06', '2026-04-01')).toBe('future');
    expect(reach('2026-04-01', '2026-10-06', '2026-04-01')).toBe('retro');
    expect(reach('2026-03-31', '2026-10-06', '2026-04-01')).toBe('before_limit');
  });

  it('lists every month from the effective date to today, across a year end', () => {
    expect(affectedMonths('2025-11-15', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(affectedMonths('2026-10-01', '2026-10-06')).toEqual(['2026-10']);
  });

  it('YX-HIS-04: "today" is the calendar date in the location time zone', () => {
    const at = new Date('2026-09-30T19:00:00Z'); // 00:30 on 1 Oct in India, still 30 Sep in London
    expect(localToday('Asia/Kolkata', at)).toBe('2026-10-01');
    expect(localToday('Europe/London', at)).toBe('2026-09-30');
  });
});

describe('dotted-line managers (M01 Q5, P01 §4.4)', () => {
  it('a manager change or transfer may set them; other types may not; no duplicates, never also the manager', () => {
    expect(payloadProblem('manager_change', { assignment: { dottedLineManagerIds: ['d1', 'd2'] } })).toBeNull();
    expect(payloadProblem('transfer', { assignment: { locationId: 'x', dottedLineManagerIds: [] } })).toBeNull();
    expect(payloadProblem('promotion', { assignment: { dottedLineManagerIds: ['d1'] } })).toMatch(/cannot change dottedLineManagerIds/);
    expect(payloadProblem('manager_change', { assignment: { dottedLineManagerIds: ['d1', 'd1'] } })).toMatch(/listed twice/);
    expect(payloadProblem('manager_change', { assignment: { managerEmployeeId: 'd1', dottedLineManagerIds: ['d1'] } })).toMatch(/not also a dotted-line manager/);
  });

  it('are kept sorted, survive other changes, and a dotted line promoted to manager leaves the list', () => {
    const withDotted = applyFact('assignment', A, { assignment: { dottedLineManagerIds: ['d2', 'd1'] } }) as AssignmentValues;
    expect(withDotted.dottedLineManagerIds).toEqual(['d1', 'd2']);
    const moved = applyFact('assignment', withDotted, { assignment: { locationId: 'loc2' } }) as AssignmentValues;
    expect(moved.dottedLineManagerIds).toEqual(['d1', 'd2']);
    const promoted = applyFact('assignment', withDotted, { assignment: { managerEmployeeId: 'd1' } }) as AssignmentValues;
    expect(promoted).toMatchObject({ managerEmployeeId: 'd1', dottedLineManagerIds: ['d2'] });
  });
});
