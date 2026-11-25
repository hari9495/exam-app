import { describe, expect, it } from 'vitest';
import { shiftLabel } from './attendance';

describe('shiftLabel', () => {
  it('adds "shift" once: a name that already ends in it is kept (no "Plant day shift shift")', () => {
    expect(shiftLabel('Plant day shift')).toBe('Plant day shift');
    expect(shiftLabel('General')).toBe('General shift');
    expect(shiftLabel(' Night Shift ')).toBe('Night Shift');
  });
});
