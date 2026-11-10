import { idLast4, idProblem, imageAllowed, minorProblem, nameKey, reviewBy, watchMatches } from './visitor-guard-rules';

describe('visitor guard rules (slice 3)', () => {
  it('keeps only 4 letters or digits of an ID number, never more', () => {
    expect(idLast4(' ab12 ')).toBe('AB12');
    expect(idLast4('1234 5678 9012')).toBeNull();
    expect(idLast4('123')).toBeNull();
    expect(idLast4('12-4')).toBeNull();
  });

  it('asks for ID only where the location takes it, and never from a minor', () => {
    expect(idProblem('off', false, {})).toBeNull();
    expect(idProblem('off', false, { type: 'pan', last4: '123F' })).toMatch(/does not take/);
    expect(idProblem('on', false, {})).toMatch(/ID type/);
    expect(idProblem('on', false, { type: 'passport', last4: '123456' })).toMatch(/last 4/);
    expect(idProblem('with_image', false, { type: 'passport', last4: 'z123' })).toBeNull();
    expect(idProblem('on', false, { type: 'ration_card', last4: '1234' })).toMatch(/ID type/);
    expect(idProblem('on', true, {})).toBeNull();
    expect(idProblem('on', true, { type: 'pan', last4: '1234' })).toMatch(/under 18/);
  });

  it('never takes an image of an Aadhaar card', () => {
    expect(imageAllowed('aadhaar')).toBe(false);
    expect(imageAllowed(null)).toBe(false);
    expect(imageAllowed('driving_licence')).toBe(true);
  });

  it('matches the watch-list by mobile, then by name', () => {
    const e = { mobile: '+919840122871', nameKey: nameKey('  Manish   GUPTA ') };
    expect(e.nameKey).toBe('manish gupta');
    expect(watchMatches(e, { name: 'Someone Else', mobile: '+919840122871' })).toBe(true);
    expect(watchMatches(e, { name: 'manish gupta', mobile: '+919999999999' })).toBe(true);
    expect(watchMatches(e, { name: 'Manish Guptha', mobile: '+919999999999' })).toBe(false);
    expect(watchMatches({ mobile: null, nameKey: 'asha k' }, { name: 'Asha K', mobile: null })).toBe(true);
  });

  it('an entry lapses after the review period', () => {
    expect(reviewBy(new Date('2026-01-01T00:00:00Z'), 365).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('a visitor under 18 needs a named adult', () => {
    expect(minorProblem(false, null)).toBeNull();
    expect(minorProblem(true, ' ')).toMatch(/adult/);
    expect(minorProblem(true, 'Lakshmi Rao')).toBeNull();
  });
});
