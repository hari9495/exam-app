import { applyTerms, DEFAULT_TERMS, termProblem, TERM_SETTINGS, type Terms } from './terms';

// T2-G 84a (answer 2743): the company's own words in notification and email text.
const terms = (over: Partial<Terms>): Terms => ({ ...DEFAULT_TERMS, ...over });

describe('applyTerms', () => {
  const t = terms({ department: { one: 'Business unit', many: 'Business units' }, sub_department: { one: 'Team', many: 'Teams' }, employee: { one: 'Associate', many: 'Associates' }, grade: { one: 'BU level', many: 'BU levels' }, location: { one: 'Site', many: 'Sites' } });

  it('changes whole words, singular and plural, keeping a capital or lower case', () => {
    expect(applyTerms('Department: Quality. Choose a department; all departments.', t)).toBe('Business unit: Quality. Choose a business unit; all business units.');
    expect(applyTerms('Sub-department and sub-departments', t)).toBe('Team and teams');
    expect(applyTerms('Employee code', t)).toBe('Associate code');
    // An abbreviation keeps its capitals.
    expect(applyTerms('your grade', t)).toBe('your BU level');
  });

  it('never changes the law\'s names, words in capitals, parts of other words, links or tags', () => {
    expect(applyTerms("Employees' Provident Fund and Employees State Insurance", t)).toBe("Employees' Provident Fund and Employees State Insurance");
    expect(applyTerms('DEPARTMENT', t)).toBe('DEPARTMENT');
    expect(applyTerms('departmental relocation', t)).toBe('departmental relocation');
    expect(applyTerms('<a href="https://x.test/settings/locations" title="Locations">Locations</a>', t)).toBe('<a href="https://x.test/settings/locations" title="Locations">Sites</a>');
    expect(applyTerms('see /yx/time/setup/locations', t)).toBe('see /yx/time/setup/locations');
  });

  it('the YukthiX words leave the text as it is', () => {
    expect(applyTerms('Department and Grade', DEFAULT_TERMS)).toBe('Department and Grade');
  });
});

describe('term settings', () => {
  it('fourteen company settings, YukthiX words by default, plain words of up to 30 characters', () => {
    expect(Object.keys(TERM_SETTINGS)).toHaveLength(14);
    expect(TERM_SETTINGS['terms.legal_entity.many']).toEqual(expect.objectContaining({ default: 'Legal entities', scopes: ['tenant'], text: { maxLength: 30 } }));
    expect(termProblem('Business unit')).toBeNull();
    expect(termProblem('व्यावसायिक इकाई')).toBeNull();
    expect(termProblem('<b>Unit</b>')).toMatch(/letters, numbers/);
    expect(termProblem('Unit\nTwo')).toMatch(/one line/);
  });
});
