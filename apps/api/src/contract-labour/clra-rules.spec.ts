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

  it('the registration threshold warns, never blocks', () => {
    const c = workerChecks({ ...base, activeAtSite: 49 });
    expect(c.find((x) => x.id === 'threshold')!.status).toBe('warn');
    expect(c.filter((x) => x.status === 'fail')).toEqual([]);
    expect(workerChecks({ ...base, activeAtSite: 48 }).find((x) => x.id === 'threshold')!.status).toBe('pass');
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
