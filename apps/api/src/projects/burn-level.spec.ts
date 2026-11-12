import { burnLevel } from './projects.service';

// Answer 1405: the burn level for hours used against the hours budget, at the company's two thresholds.
describe('burnLevel', () => {
  it('is 0 under the first threshold or without a budget', () => {
    expect(burnLevel(15.99, 20, 80, 100)).toBe(0);
    expect(burnLevel(500, null, 80, 100)).toBe(0);
    expect(burnLevel(500, 0, 80, 100)).toBe(0);
  });
  it('is the first threshold from it up to the second, then the second', () => {
    expect(burnLevel(16, 20, 80, 100)).toBe(80);
    expect(burnLevel(19.99, 20, 80, 100)).toBe(80);
    expect(burnLevel(20, 20, 80, 100)).toBe(100);
    expect(burnLevel(40, 20, 80, 100)).toBe(100);
  });
  it('follows the company thresholds', () => {
    expect(burnLevel(14, 20, 70, 120)).toBe(70);
    expect(burnLevel(22, 20, 70, 120)).toBe(70);
    expect(burnLevel(24, 20, 70, 120)).toBe(120);
  });
});
