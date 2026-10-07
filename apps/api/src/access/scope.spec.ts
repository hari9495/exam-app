import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { covers, coversRange, overlaps, Period, started } from './scope';
import { ProfileRequestDto } from '../people/profile.dto';
import { ROLE_TEMPLATES } from './role-templates';
import { holdsConfidential, grantScopesFor } from '@exam-platform/shared';

// P02 §4.3 time-aware scope periods (YX-SEC-06) and the §4.5 request body checks (M01 YX-EMP-01).
describe('scope periods', () => {
  const p: Period[] = [
    ['2026-01-01', '2026-03-31'],
    ['2026-04-01', '2026-06-30'],
    ['2026-09-01', null],
  ];
  it('covers a day inside a period, not in a gap', () => {
    expect(covers(p, '2026-02-10')).toBe(true);
    expect(covers(p, '2026-07-15')).toBe(false);
    expect(covers(p, '2030-01-01')).toBe(true);
  });
  it('overlaps a range touching any period', () => {
    expect(overlaps(p, '2026-07-01', '2026-08-31')).toBe(false);
    expect(overlaps(p, '2026-08-01', '2026-09-01')).toBe(true);
    expect(overlaps(p, '2025-01-01', null)).toBe(true);
  });
  it('covers a whole range only without gaps (adjacent periods join)', () => {
    expect(coversRange(p, '2026-02-01', '2026-06-30')).toBe(true);
    expect(coversRange(p, '2026-02-01', '2026-09-15')).toBe(false);
    expect(coversRange(p, '2026-09-02', '2027-12-31')).toBe(true);
    expect(coversRange([], '2026-01-01', '2026-01-02')).toBe(false);
  });
  it('an open-ended range is covered only by a period that never ends (a change folds forward, P06)', () => {
    expect(coversRange(p, '2026-09-02', null)).toBe(true);
    expect(coversRange(p, '2026-02-01', null)).toBe(false);
    expect(coversRange([['2026-01-01', '2026-03-31']], '2026-02-01', null)).toBe(false);
  });
  it('a period that has not started opens nothing yet; a running one keeps its end (YX-SEC-06)', () => {
    expect(started(p, '2026-05-01')).toEqual([p[0], p[1]]);
    expect(started(p, '2026-09-01')).toEqual(p);
  });
});

describe('identity / bank change bodies (P02 §4.5, M01 YX-EMP-01)', () => {
  const errors = (body: object) => validateSync(plainToInstance(ProfileRequestDto, body), { whitelist: true, forbidNonWhitelisted: true }).length;
  it('accepts well-formed values', () => {
    expect(errors({ kind: 'pan', value: { pan: 'ABCPE1234F' }, reason: 'x' })).toBe(0);
    expect(errors({ kind: 'aadhaar', value: { aadhaar: '468135790248' }, reason: 'x' })).toBe(0);
    expect(errors({ kind: 'bank_salary', value: { holderName: 'A', accountNumber: '123456789012', ifsc: 'HDFC0001234' }, reason: 'x' })).toBe(0);
  });
  it('refuses a bad Aadhaar checksum, a 0/1-leading Aadhaar, malformed PAN / IFSC / UAN and unknown fields', () => {
    expect(errors({ kind: 'aadhaar', value: { aadhaar: '468135790249' }, reason: 'x' })).toBeGreaterThan(0);
    expect(errors({ kind: 'aadhaar', value: { aadhaar: '168135790248' }, reason: 'x' })).toBeGreaterThan(0);
    expect(errors({ kind: 'pan', value: { pan: 'ABCP1234F' }, reason: 'x' })).toBeGreaterThan(0);
    expect(errors({ kind: 'bank_salary', value: { holderName: 'A', accountNumber: '12', ifsc: 'HDFC1234567' }, reason: 'x' })).toBeGreaterThan(0);
    expect(errors({ kind: 'uan', value: { uan: '12345' }, reason: 'x' })).toBeGreaterThan(0);
    expect(errors({ kind: 'pan', value: { pan: 'ABCPE1234F', salary: 1 }, reason: 'x' })).toBeGreaterThan(0);
    expect(errors({ kind: 'nope', value: {}, reason: 'x' })).toBeGreaterThan(0);
  });
});

describe('role templates (P02 §4.2)', () => {
  it('keep pay and identity out of HR Executive and Finance, and every key fits its typical scope', () => {
    const t = (k: string) => ROLE_TEMPLATES.find((x) => x.key === k)!;
    expect(holdsConfidential(t('hr_executive').permissions)).toBe(false);
    expect(t('finance').permissions).not.toContain('employee.salary.view');
    expect(holdsConfidential(t('payroll_admin').permissions)).toBe(true);
    for (const template of ROLE_TEMPLATES) for (const key of template.permissions) expect(grantScopesFor(key)).toContain(template.typicalScope);
  });
});
