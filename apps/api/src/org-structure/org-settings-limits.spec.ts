import { pastLimit } from './org-settings.service';

// Answer 1324: a value past the legal limit is refused naming the Act; the limit itself and anything more generous pass.
describe('pastLimit', () => {
  const week = { max: 48, act: 'Factories Act, 1948 s.51' };
  const offs = { min: 1, act: 'Factories Act, 1948 s.52' };
  it('a ceiling: 48 and 45 pass, 54 is refused naming the Act', () => {
    expect(pastLimit('Most hours of shifts in a week', '48', week)).toBeNull();
    expect(pastLimit('Most hours of shifts in a week', '45', week)).toBeNull();
    expect(pastLimit('Most hours of shifts in a week', '54', week)).toBe('Most hours of shifts in a week can be at most 48 by law (Factories Act, 1948 s.51). Choose 48 or less.');
  });
  it('a floor: 1 and 2 pass, 0 is refused naming the Act', () => {
    expect(pastLimit('Weekly offs each week at least', '1', offs)).toBeNull();
    expect(pastLimit('Weekly offs each week at least', '2', offs)).toBeNull();
    expect(pastLimit('Weekly offs each week at least', '0', offs)).toMatch(/at least 1 by law \(Factories Act, 1948 s\.52\)/);
  });
  it('no limit, or a word value, is never refused', () => {
    expect(pastLimit('x', '60', undefined)).toBeNull();
    expect(pastLimit('x', 'never', week)).toBeNull();
    expect(pastLimit('x', '10.5', { max: 10.5, act: 'a' })).toBeNull();
    expect(pastLimit('x', '12', { max: 10.5, act: 'a' })).not.toBeNull();
  });
});
