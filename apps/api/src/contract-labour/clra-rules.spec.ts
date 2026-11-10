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
