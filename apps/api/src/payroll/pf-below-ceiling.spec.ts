import { calculatePayslip } from './calc';
import { COMPONENTS, RULES, snapshot } from './regression/fixtures';

// B2 (batch H part 2, answer 2403): a component that is PF wage "only below the ceiling" counts while the rest of the
// month's PF wage, earned after loss of pay, is under the ceiling (25,000 from 17 Sep 2026); never above it.
const comps = COMPONENTS.map((c) => (c.code === 'special' ? { ...c, pfWage: true, pfBelowCeiling: true } : c));
const pfOf = (basic: string, special: string, lopDays = '0') => {
  const s = snapshot({ components: comps, attendance: { ...snapshot().attendance, lopDays }, segments: [{ ...snapshot().segments[0], lines: [{ code: 'basic', monthly: basic }, { code: 'special', monthly: special }] }] });
  return calculatePayslip(s, RULES).lines.find((l) => l.code === 'pf_employee')?.amount;
};

describe('PF wage only below the ceiling (B2)', () => {
  it('basic 20,000 is below 25,000: special 10,000 counts; PF on the ceiling 25,000 = 3,000', () => {
    expect(pfOf('20000', '10000')).toBe('3000.00');
  });
  it('basic exactly 25,000 is not below the ceiling: special does not count; PF 3,000 on basic alone', () => {
    expect(pfOf('25000', '10000')).toBe('3000.00');
  });
  it('basic 12,000: special 3,000 counts in full, PF on 15,000 = 1,800 (below the ceiling either way)', () => {
    expect(pfOf('12000', '3000')).toBe('1800.00');
  });
  it('loss of pay brings basic 31,000 to 15,500 (half a month): special then counts (2403)', () => {
    // 31 days, 15.5 LOP: basic 15,500 and special 5,000 earned -> PF wage 20,500 -> 2,460.
    expect(pfOf('31000', '10000', '15.5')).toBe('2460.00');
  });
  it('a plain PF wage component is unchanged', () => {
    const s = snapshot({ segments: [{ ...snapshot().segments[0], lines: [{ code: 'basic', monthly: '20000' }, { code: 'special', monthly: '10000' }] }] });
    expect(calculatePayslip(s, RULES).lines.find((l) => l.code === 'pf_employee')?.amount).toBe('2400.00');
  });
});
