import { Prisma } from '@prisma/client';
import { netBookValue, nextTag, recoveryAmount } from './asset-categories';

// IT assets part 1: tag numbering (answer 2720) and the F&F recovery basis (answer 2712).
describe('nextTag', () => {
  const lap = { tagPrefix: 'LAP', tagYear: true, tagDigits: 4 };
  it('one more than the highest counter of this year, padded; other years and typed tags are ignored', () => {
    expect(nextTag(lap, '2026', ['LAP-2026-0041', 'lap-2026-0007', 'LAP-2025-0099', 'LAP-2026-OLD', 'OLD-1'])).toBe('LAP-2026-0042');
    expect(nextTag(lap, '2027', ['LAP-2026-0041'])).toBe('LAP-2027-0001');
  });
  it('without the year; a counter past the digits keeps growing', () => {
    expect(nextTag({ tagPrefix: 'PH', tagYear: false, tagDigits: 3 }, '2026', ['PH-999', 'PH-2026-001'])).toBe('PH-1000');
  });
  it('negative: no prefix, no pattern', () => {
    expect(nextTag({ tagPrefix: null, tagYear: true, tagDigits: 4 }, '2026', ['LAP-2026-0001'])).toBeNull();
  });
});

describe('recoveryAmount', () => {
  const d = (s: string) => new Prisma.Decimal(s);
  it('category default first, else the cost', () => {
    expect(recoveryAmount('category_default', d('45000'), d('90000'))).toBe('45000.00');
    expect(recoveryAmount('category_default', null, d('90000'))).toBe('90000.00');
    expect(recoveryAmount('category_default', null, null)).toBeNull();
  });
  it('written-down value is the net book value given; without one, HR decides', () => {
    expect(recoveryAmount('written_down', d('45000'), d('90000'), '60000.00')).toBe('60000.00');
    expect(recoveryAmount('written_down', d('45000'), d('90000'))).toBeNull();
  });
  it('negative: HR decides gives no amount', () => {
    expect(recoveryAmount('hr_decides', d('45000'), d('90000'), '60000.00')).toBeNull();
  });
});

// Answer 2713: the net book value, straight line by default or declining balance; never below 0.
describe('netBookValue', () => {
  const d = (s: string) => new Prisma.Decimal(s);
  const sl = (life: number | null) => ({ depreciationMethod: 'straight_line', usefulLifeYears: life, depreciationRate: null });
  const db = (rate: string | null) => ({ depreciationMethod: 'declining', usefulLifeYears: 3, depreciationRate: rate ? d(rate) : null });
  it('straight line: evenly by day over the useful life', () => {
    // 2024-01-01 to 2027-01-01 is 1096 days; halfway-ish after 548 days.
    expect(netBookValue(d('90000'), '2024-01-01', '2024-01-01', sl(3))).toBe('90000.00');
    expect(netBookValue(d('90000'), '2024-01-01', '2025-07-02', sl(3))).toBe('45000.00');
    expect(netBookValue(d('100000'), '2025-01-01', '2026-01-01', sl(4))).toBe('75017.11');
  });
  it('straight line: fully depreciated at the end of its life and after it is 0, never below', () => {
    expect(netBookValue(d('90000'), '2024-01-01', '2027-01-01', sl(3))).toBe('0.00');
    expect(netBookValue(d('90000'), '2020-01-01', '2026-11-26', sl(3))).toBe('0.00');
  });
  it('declining balance: the yearly rate on what is left, pro rata by day', () => {
    expect(netBookValue(d('100000'), '2025-01-01', '2026-01-01', db('40'))).toBe('60000.00');
    expect(netBookValue(d('100000'), '2024-01-01', '2025-12-31', db('40'))).toBe('36000.00');
    expect(Number(netBookValue(d('100000'), '2025-01-01', '2025-07-02', db('40')))).toBeCloseTo(77513.89, 1); // 182 of 365 days
  });
  it('a purchase date after the day keeps the cost', () => {
    expect(netBookValue(d('5000'), '2026-12-01', '2026-11-26', sl(3))).toBe('5000.00');
  });
  it('negative: no cost, no purchase date, life 0 or missing, no or bad rate: no value', () => {
    expect(netBookValue(null, '2024-01-01', '2026-01-01', sl(3))).toBeNull();
    expect(netBookValue(d('0'), '2024-01-01', '2026-01-01', sl(3))).toBe('0.00');
    expect(netBookValue(d('90000'), null, '2026-01-01', sl(3))).toBeNull();
    expect(netBookValue(d('90000'), '2024-01-01', '2026-01-01', sl(0))).toBeNull();
    expect(netBookValue(d('90000'), '2024-01-01', '2026-01-01', sl(null))).toBeNull();
    expect(netBookValue(d('90000'), '2024-01-01', '2026-01-01', db(null))).toBeNull();
    expect(netBookValue(d('90000'), '2024-01-01', '2026-01-01', db('100'))).toBeNull();
  });
});
