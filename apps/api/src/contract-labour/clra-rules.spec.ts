import { ESIC_CODE, LIN, PF_CODE, alertDaysOf, alertDue, deployBlock, licenceState, type LicenceLike } from './clra-rules';

const lic = (p: Partial<LicenceLike> = {}): LicenceLike => ({ id: 'l1', locationId: 'hosur', states: ['IN-TN'], validFrom: '2026-01-01', validTo: '2026-12-31', status: 'verified', renewalOfId: null, ...p });
const at = (on: string, p: Partial<{ locationId: string; state: string }> = {}) => ({ locationId: 'hosur', state: 'IN-TN', on, ...p });

describe('contract labour licence rules (CL-1)', () => {
  it('a verified licence in force covering the state allows deployment', () => {
    expect(deployBlock([lic()], at('2026-06-01'))).toBeNull();
    expect(deployBlock([lic()], at('2026-12-31'))).toBeNull();
  });

  it('blocks after expiry, before the start, for another site, another state, and pending or rejected licences', () => {
    expect(deployBlock([lic()], at('2027-01-01'))).toMatch(/not valid on this day/);
    expect(deployBlock([lic()], at('2025-12-31'))).toMatch(/not valid on this day/);
    expect(deployBlock([lic()], at('2026-06-01', { locationId: 'chennai' }))).toMatch(/no verified licence/);
    expect(deployBlock([lic()], at('2026-06-01', { state: 'IN-KL' }))).toMatch(/does not cover/);
    expect(deployBlock([lic({ status: 'pending' })], at('2026-06-01'))).toMatch(/no verified licence/);
    expect(deployBlock([lic({ status: 'rejected' })], at('2026-06-01'))).toMatch(/no verified licence/);
  });

  it('a renewal counts only once verified', () => {
    const renewal = lic({ id: 'l2', validFrom: '2027-01-01', validTo: '2027-12-31', renewalOfId: 'l1', status: 'pending' });
    expect(deployBlock([lic(), renewal], at('2027-02-01'))).toMatch(/renewal is waiting for verification/);
    expect(deployBlock([lic(), { ...renewal, status: 'verified' }], at('2027-02-01'))).toBeNull();
  });

  it('states: expiring inside the longest alert day, expired, renewed, pending, not started', () => {
    const days = [60, 30, 7];
    expect(licenceState(lic(), '2026-06-01', days)).toBe('valid');
    expect(licenceState(lic(), '2026-11-01', days)).toBe('expiring');
    expect(licenceState(lic(), '2026-11-02', days)).toBe('expiring');
    expect(licenceState(lic(), '2026-10-31', days)).toBe('valid');
    expect(licenceState(lic(), '2027-01-01', days)).toBe('expired');
    expect(licenceState(lic({ status: 'pending' }), '2026-06-01', days)).toBe('pending');
    expect(licenceState(lic(), '2025-06-01', days)).toBe('not-started');
    const renewed = lic({ id: 'l2', renewalOfId: 'l1', validFrom: '2027-01-01', validTo: '2027-12-31' });
    expect(licenceState(lic(), '2026-11-01', days, [lic(), renewed])).toBe('valid');
    expect(licenceState(lic(), '2027-01-02', days, [lic(), renewed])).toBe('renewed');
    expect(licenceState(lic(), '2027-01-02', days, [lic(), { ...renewed, status: 'pending' }])).toBe('expired');
  });

  it('alerts fall on the lead days only', () => {
    expect(alertDue('2026-12-31', '2026-11-01', [60, 30, 7])).toBe(60);
    expect(alertDue('2026-12-31', '2026-12-24', [60, 30, 7])).toBe(7);
    expect(alertDue('2026-12-31', '2026-12-25', [60, 30, 7])).toBeNull();
    expect(alertDue('2026-12-31', '2027-01-01', [60, 30, 7])).toBeNull();
    expect(alertDaysOf('7,60,30')).toEqual([60, 30, 7]);
    expect(alertDaysOf('')).toEqual([]);
  });

  it('code formats', () => {
    expect(PF_CODE.test('TNMAS0012345000')).toBe(true);
    expect(PF_CODE.test('TNMAS0012345')).toBe(true);
    expect(PF_CODE.test('TN/MAS/12345')).toBe(false);
    expect(ESIC_CODE.test('51000123450001001')).toBe(true);
    expect(ESIC_CODE.test('5100012345')).toBe(false);
    expect(LIN.test('1234567890')).toBe(true);
    expect(LIN.test('1-2345-6789-0')).toBe(true);
    expect(LIN.test('LIN123')).toBe(false);
  });
});

import { ageOn, gateValidTo, monthsLater, workerChecks } from './clra-rules';

describe('contract worker rules (CL-2)', () => {
  it('age in whole years', () => {
    expect(ageOn('2008-10-01', '2026-09-30')).toBe(17);
    expect(ageOn('2008-10-01', '2026-10-01')).toBe(18);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('months later, less a day; the gate pass ends first of deployment, licence, induction', () => {
    expect(monthsLater('2026-03-10', 12)).toBe('2027-03-09');
    expect(monthsLater('2026-01-31', 1)).toBe('2026-02-27');
    expect(gateValidTo({ toOn: null, licenceValidTo: '2027-08-31', inductionOn: '2026-03-10', inductionMonths: 12 })).toBe('2027-03-09');
    expect(gateValidTo({ toOn: '2026-12-31', licenceValidTo: '2027-08-31', inductionOn: '2026-03-10', inductionMonths: 12 })).toBe('2026-12-31');
    expect(gateValidTo({ toOn: null, licenceValidTo: '2026-11-30', inductionOn: null, inductionMonths: null })).toBe('2026-11-30');
  });

  const base = {
    dob: '1994-07-03',
    on: '2026-10-01',
    minAge: 18,
    licences: [{ id: 'l1', locationId: 'hosur', states: ['IN-TN'], validFrom: '2026-01-01', validTo: '2026-12-31', status: 'verified' as const, renewalOfId: null }],
    site: { locationId: 'hosur', state: 'IN-TN', name: 'Hosur plant' },
    licenceMax: 20,
    activeUnderLicence: 10,
    activeAtSite: 10,
    threshold: 50,
    duplicateAt: null as string | null,
  };
  const fails = (x: Partial<typeof base>) => workerChecks({ ...base, ...x }).filter((c) => c.status === 'fail').map((c) => c.id);

  it('all pass; each block on its own', () => {
    expect(fails({})).toEqual([]);
    expect(fails({ dob: '2009-05-12' })).toEqual(['age']);
    expect(fails({ on: '2027-01-02' })).toEqual(['licence']);
    expect(fails({ site: { locationId: 'hosur', state: 'IN-KL', name: 'Hosur plant' } })).toEqual(['licence']);
    expect(fails({ activeUnderLicence: 20 })).toEqual(['max']);
    expect(fails({ activeUnderLicence: 19 })).toEqual([]);
    expect(fails({ duplicateAt: 'Bengaluru head office' })).toEqual(['dup']);
  });

  it('answers 622 / 681: warn at 80 % of the threshold, block at it without a registration, block above the registration', () => {
    const t = (x: Partial<Parameters<typeof workerChecks>[0]>) => workerChecks({ ...base, ...x }).find((c) => c.id === 'threshold')!.status;
    expect(t({ activeAtSite: 38 })).toBe('pass');
    expect(t({ activeAtSite: 39 })).toBe('warn');
    expect(t({ activeAtSite: 48 })).toBe('warn');
    expect(t({ activeAtSite: 49 })).toBe('fail');
    expect(t({ activeAtSite: 49, registration: { maxWorkers: 250 } })).toBe('pass');
    expect(t({ activeAtSite: 250, registration: { maxWorkers: 250 } })).toBe('fail');
    expect(t({ activeAtSite: 44, warnPct: 90 })).toBe('warn');
    expect(t({ activeAtSite: 43, warnPct: 90 })).toBe('pass');
  });
});

describe('work order headcount (CL-2, answer 675)', () => {
  const base = { dob: '1994-07-03', on: '2026-10-01', minAge: 18, licences: [{ id: 'l1', locationId: 'hosur', states: ['IN-TN'], validFrom: '2026-01-01', validTo: '2026-12-31', status: 'verified' as const, renewalOfId: null }], site: { locationId: 'hosur', state: 'IN-TN', name: 'Hosur plant' }, licenceMax: 20, activeUnderLicence: 10, activeAtSite: 10, threshold: 50, duplicateAt: null };
  it('warns past the headcount, never blocks; no work order, no row', () => {
    const over = workerChecks({ ...base, workOrder: { number: 'WO-7', headcount: 10, active: 10 } });
    expect(over.find((c) => c.id === 'workorder')!.status).toBe('warn');
    expect(over.some((c) => c.status === 'fail')).toBe(false);
    expect(workerChecks({ ...base, workOrder: { number: 'WO-7', headcount: 11, active: 10 } }).find((c) => c.id === 'workorder')!.status).toBe('pass');
    expect(workerChecks(base).some((c) => c.id === 'workorder')).toBe(false);
  });
});

import { holdsBill, monthOf, packDue, packStatus, recoveryFrom, requiredProofs, wageShortfall } from './clra-rules';

describe('monthly proofs, wage check and hold (CL-4)', () => {
  it('due on the cut-off day of the following month, clipped to the month', () => {
    expect(packDue('2026-08-01', 15)).toBe('2026-09-15');
    expect(packDue('2026-12-01', 15)).toBe('2027-01-15');
    expect(packDue('2026-01-01', 31)).toBe('2026-02-28');
    expect(monthOf('2026-08-19')).toBe('2026-08-01');
  });

  it('pack status: discrepancy wins, all verified, overdue after the due day, submitted, open', () => {
    const all = { pf_challan: 'verified', esi_challan: 'verified', wage_register: 'verified', bank_proof: 'verified', muster_roll: 'verified' } as const;
    expect(packStatus(all, '2026-09-15', '2026-10-01')).toBe('verified');
    expect(packStatus({ ...all, esi_challan: 'discrepancy' }, '2026-09-15', '2026-09-01')).toBe('discrepancy');
    expect(packStatus({ ...all, bank_proof: 'submitted' }, '2026-09-15', '2026-09-15')).toBe('submitted');
    expect(packStatus({ ...all, bank_proof: 'submitted' }, '2026-09-15', '2026-09-16')).toBe('overdue');
    expect(packStatus({ pf_challan: 'submitted' }, '2026-09-15', '2026-09-10')).toBe('open');
    expect(packStatus({}, '2026-09-15', '2026-09-16')).toBe('overdue');
  });

  it('741: only the required proofs decide the status; a discrepancy on any proof still counts', () => {
    const two = requiredProofs('pf_challan,esi_challan');
    expect(two).toEqual(['pf_challan', 'esi_challan']);
    expect(requiredProofs('muster_roll,pf_challan,nope')).toEqual(['pf_challan', 'muster_roll']);
    expect(packStatus({ pf_challan: 'verified', esi_challan: 'verified' }, '2026-09-15', '2026-10-01', two)).toBe('verified');
    expect(packStatus({ pf_challan: 'verified', esi_challan: 'verified', muster_roll: 'discrepancy' }, '2026-09-15', '2026-09-01', two)).toBe('discrepancy');
    expect(packStatus({ pf_challan: 'verified' }, '2026-09-15', '2026-09-16', two)).toBe('overdue');
    const four = { pf_challan: 'verified', esi_challan: 'verified', wage_register: 'verified', bank_proof: 'verified' } as const;
    expect(packStatus(four, '2026-09-15', '2026-09-16')).toBe('overdue');
  });

  it('the hold: overdue or disputed and not released', () => {
    expect(holdsBill('overdue', false)).toBe(true);
    expect(holdsBill('discrepancy', false)).toBe(true);
    expect(holdsBill('discrepancy', true)).toBe(false);
    expect(holdsBill('submitted', false)).toBe(false);
    expect(holdsBill('open', false)).toBe(false);
  });

  it('wage shortfall: daily rate times days, capped at the monthly rate', () => {
    const m = { minDailyPaise: 57000n, minMonthlyPaise: 1482000n };
    expect(wageShortfall({ ...m, days: 26, grossPaise: 1482000n })).toEqual({ duePaise: 1482000n, shortPaise: 0n });
    expect(wageShortfall({ ...m, days: 30, grossPaise: 1482000n })).toEqual({ duePaise: 1482000n, shortPaise: 0n });
    expect(wageShortfall({ ...m, days: 10, grossPaise: 500000n })).toEqual({ duePaise: 570000n, shortPaise: 70000n });
    expect(wageShortfall({ ...m, days: 0, grossPaise: 0n })).toEqual({ duePaise: 0n, shortPaise: 0n });
  });

  it('recovery: oldest first, never more than the bill', () => {
    expect(recoveryFrom(100000n, [{ id: 'a', leftPaise: 30000n }, { id: 'b', leftPaise: 90000n }])).toEqual({ totalPaise: 100000n, take: [{ id: 'a', paise: 30000n }, { id: 'b', paise: 70000n }] });
    expect(recoveryFrom(0n, [{ id: 'a', leftPaise: 30000n }])).toEqual({ totalPaise: 0n, take: [] });
    expect(recoveryFrom(50000n, [])).toEqual({ totalPaise: 0n, take: [] });
  });
});

import { peakOf, shortDays } from './clra-rules';

describe('attendance and the peak (CL-5)', () => {
  it('the highest number of workers on one day, and when', () => {
    expect(peakOf([], '2026-01-01', '2026-12-31')).toEqual({ peak: 0, on: null });
    expect(peakOf([{ from: '2026-03-01', to: '2026-03-31' }, { from: '2026-03-15', to: null }, { from: '2026-04-01', to: '2026-04-10' }], '2026-01-01', '2026-12-31')).toEqual({ peak: 2, on: '2026-03-15' });
    expect(peakOf([{ from: '2025-01-01', to: '2025-06-30' }], '2026-01-01', '2026-12-31')).toEqual({ peak: 0, on: null });
    expect(peakOf([{ from: '2025-12-01', to: null }, { from: '2026-02-01', to: '2026-02-01' }], '2026-01-01', '2026-12-31')).toEqual({ peak: 2, on: '2026-02-01' });
  });
  it('days paid against days on site', () => {
    expect(shortDays(26, 24)).toBe(0);
    expect(shortDays(20, 24)).toBe(4);
  });
});

