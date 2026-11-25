import { STARTER_SYNONYMS, parseSynonyms, synonymsFor } from './kb-search';

// Answer 1642: a company word list for knowledge search; the Indian HR starter list until HR changes it.
describe('knowledge search synonyms', () => {
  const groups = parseSynonyms(STARTER_SYNONYMS);
  it('the starter list holds the Indian HR words', () => {
    const flat = groups.flat();
    for (const w of ['pf', 'provident fund', 'cl', 'casual leave', 'payslip', 'salary slip', 'form 16', 'uan', 'esi']) expect(flat).toContain(w);
  });
  it('a word or a phrase brings its group, never itself', () => {
    expect(synonymsFor('how do I withdraw my PF', groups)).toEqual(['provident fund', 'epf']);
    expect(synonymsFor('Provident Fund balance', groups)).toEqual(['pf', 'epf']);
    expect(synonymsFor('apply CL tomorrow', groups)).toEqual(['casual leave']);
    expect(synonymsFor('printer jam', groups)).toEqual([]);
    // Whole words only: "pfizer" is not PF.
    expect(synonymsFor('pfizer vendor', groups)).toEqual([]);
  });
  it('negative: refuses a line with one word, odd characters or too many lines, naming the line', () => {
    expect(() => parseSynonyms('pf, provident fund\ncanteen')).toThrow('Line 2: give at least two words');
    expect(() => parseSynonyms('pf; drop, x')).toThrow(/Line 1: "pf; drop"/);
    expect(() => parseSynonyms(Array.from({ length: 81 }, (_, i) => `a${i}, b${i}`).join('\n'))).toThrow('80 lines');
    expect(parseSynonyms('  CL ,  Casual   Leave \n\n')).toEqual([['cl', 'casual leave']]);
  });
});
