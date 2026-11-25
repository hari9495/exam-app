import { factoriesActFrom } from './time-core';

// Founder answer 141: the location's Registered factory flag is the single source of Factories Act coverage; a "not
// covered" value for a department or employment type excludes; where no location is flagged the setting decides as before.
const r = (value: string, scopeType: string) => ({ value, source: { scopeType } });

describe('Factories Act coverage (answer 141)', () => {
  it('a registered factory is covered, whatever the company, entity or location value says', () => {
    for (const scope of ['default', 'tenant', 'legal_entity', 'location']) {
      expect(factoriesActFrom(true, r('not_covered', scope))).toEqual({ covered: true, source: 'registered_factory', scopeType: null });
      expect(factoriesActFrom(true, r('covered', scope)).covered).toBe(true);
    }
  });

  it('at a registered factory, a department or employment type set to not covered is excluded', () => {
    expect(factoriesActFrom(true, r('not_covered', 'department'))).toEqual({ covered: false, source: 'excluded', scopeType: 'department' });
    expect(factoriesActFrom(true, r('not_covered', 'employment_type'))).toEqual({ covered: false, source: 'excluded', scopeType: 'employment_type' });
    expect(factoriesActFrom(true, r('covered', 'department')).covered).toBe(true);
  });

  it('without the flag nothing changes: the setting decides, the default is not covered', () => {
    expect(factoriesActFrom(false, r('covered', 'location'))).toEqual({ covered: true, source: 'setting', scopeType: 'location' });
    expect(factoriesActFrom(false, r('covered', 'tenant'))).toEqual({ covered: true, source: 'setting', scopeType: 'tenant' });
    expect(factoriesActFrom(false, r('covered', 'employment_type')).covered).toBe(true);
    expect(factoriesActFrom(false, r('not_covered', 'default'))).toEqual({ covered: false, source: 'default', scopeType: null });
  });
});
