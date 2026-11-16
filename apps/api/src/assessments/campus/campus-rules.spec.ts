import { DEFAULT_CAMPUS, campusSettingsProblem, ineligibleReason, missingFields, readCampus } from './campus-rules';

describe('AS-3 campus rules (PRC-29)', () => {
  const rules = { ...DEFAULT_CAMPUS, branches: ['CSE', 'IT'], graduationYear: 2027, minCgpa: 6.5 };

  it('a student who meets every rule is eligible (branch in any case)', () => {
    expect(ineligibleReason(rules, { branch: 'cse', graduationYear: 2027, cgpa: 6.5 })).toBeNull();
    expect(ineligibleReason(DEFAULT_CAMPUS, {})).toBeNull();
  });

  it('negative: each rule names why', () => {
    expect(ineligibleReason(rules, { branch: 'ECE', graduationYear: 2027, cgpa: 9 })).toMatch(/Branch/);
    expect(ineligibleReason(rules, { branch: 'IT', graduationYear: 2026, cgpa: 9 })).toBe('Graduation year must be 2027');
    expect(ineligibleReason(rules, { branch: 'IT', graduationYear: 2027, cgpa: 6.49 })).toBe('CGPA below 6.5');
    expect(ineligibleReason(rules, { branch: 'IT', graduationYear: 2027, cgpa: null })).toBe('CGPA below 6.5');
  });

  it('a rule needs its field required; required fields left empty are named', () => {
    expect(campusSettingsProblem(rules)).toBeNull();
    expect(campusSettingsProblem({ ...rules, fields: { ...rules.fields, cgpa: 'optional' } })).toMatch(/CGPA/);
    expect(campusSettingsProblem({ ...rules, fields: { ...rules.fields, branch: 'off' } })).toMatch(/branch/);
    expect(missingFields(DEFAULT_CAMPUS, { phone: '9876543210', branch: '', graduationYear: 2027 })).toEqual(['branch', 'cgpa']);
  });

  it('reads a stored value with defaults; nothing stored = not a campus drive', () => {
    expect(readCampus(null)).toBeNull();
    expect(readCampus({ minCgpa: 7 })).toEqual({ ...DEFAULT_CAMPUS, minCgpa: 7 });
  });
});
