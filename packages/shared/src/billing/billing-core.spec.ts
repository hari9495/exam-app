import { currentPeriodStart, usageRatio, warnThreshold, isOverLimit, HARD_DIMENSIONS, SOFT_DIMENSIONS } from './billing-core';

describe('billing-core', () => {
  describe('currentPeriodStart', () => {
    it('returns the first of the month at 00:00:00 UTC', () => {
      expect(currentPeriodStart(new Date('2026-08-19T17:31:00.000Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });
    it('handles the first instant of a month', () => {
      expect(currentPeriodStart(new Date('2026-01-01T00:00:00.000Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
  });
  describe('usageRatio', () => {
    it('is used/limit', () => { expect(usageRatio(50, 100)).toBe(0.5); });
    it('limit 0 with usage is Infinity, without usage is 0', () => {
      expect(usageRatio(1, 0)).toBe(Infinity);
      expect(usageRatio(0, 0)).toBe(0);
    });
  });
  describe('isOverLimit', () => {
    it('is true at or over the limit', () => {
      expect(isOverLimit(100, 100)).toBe(true);
      expect(isOverLimit(101, 100)).toBe(true);
      expect(isOverLimit(99, 100)).toBe(false);
    });
  });
  describe('warnThreshold', () => {
    it('null below 80%, 80 in [80,100), 100 at/over 100%', () => {
      expect(warnThreshold(0.79)).toBeNull();
      expect(warnThreshold(0.8)).toBe(80);
      expect(warnThreshold(0.99)).toBe(80);
      expect(warnThreshold(1.0)).toBe(100);
      expect(warnThreshold(1.5)).toBe(100);
    });
  });
  it('dimension groupings are correct', () => {
    expect([...HARD_DIMENSIONS]).toEqual(['ai_credits', 'proctoring_minutes']);
    expect([...SOFT_DIMENSIONS]).toEqual(['seats', 'candidates']);
  });
});
