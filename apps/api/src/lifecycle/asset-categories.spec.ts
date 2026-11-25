import { Prisma } from '@prisma/client';
import { nextTag, recoveryAmount } from './asset-categories';

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
  it('negative: written-down value (no depreciation yet) and HR decides give no amount', () => {
    expect(recoveryAmount('written_down', d('45000'), d('90000'))).toBeNull();
    expect(recoveryAmount('hr_decides', d('45000'), d('90000'))).toBeNull();
  });
});
