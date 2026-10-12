import { ftePercent, parsePack, PERSON_FIELDS } from './country-pack';

// G1 (G1-GLOBAL-CORE-BUILD-DESIGN §2, §3): the country pack shape and the FTE maths.
const fields = Object.fromEntries(PERSON_FIELDS.map((f) => [f, 'optional']));
const values = { kind: 'country_pack', name: 'Testland', currency: 'TST', fyStartMonth: 1, dataRegion: 'EU', normalWeekHours: '40', languages: ['en'], entityIds: [{ key: 'vat', required: true }], registrations: ['TL.SOC'], personFields: fields };
const rs = (v: unknown) => ({ jurisdiction: 'TL', version: '2026-v1', verify: true, source: 'Testland Labour Act', values: v });

describe('country packs (G1)', () => {
  it('reads a good pack', () => {
    const p = parsePack(rs(values));
    expect(p).toMatchObject({ country: 'TL', name: 'Testland', normalWeekHours: '40', registrations: ['TL.SOC'] });
    expect(p.personFields.religion).toBe('optional');
  });

  it('refuses a person field outside the catalogue, or one left unruled', () => {
    expect(() => parsePack(rs({ ...values, personFields: { ...fields, shoeSize: 'optional' } }))).toThrow(/unknown person field "shoeSize"/);
    const { religion, ...without } = fields;
    void religion;
    expect(() => parsePack(rs({ ...values, personFields: without }))).toThrow(/does not rule the person field "religion"/);
    expect(() => parsePack(rs({ ...values, personFields: { ...fields, religion: 'maybe' } }))).toThrow(/religion/);
  });

  it('refuses a bad normal week, language or kind', () => {
    for (const w of ['0', '81', '40.25', 40]) expect(() => parsePack(rs({ ...values, normalWeekHours: w }))).toThrow(/normal week/);
    expect(() => parsePack(rs({ ...values, languages: ['fr'] }))).toThrow(/language/);
    expect(() => parsePack(rs({ ...values, kind: 'pf' }))).toThrow(/not a country pack/);
  });
});

describe('FTE (G1, gap pass C1)', () => {
  it('is hours over the normal week, 100 % when the hours are empty', () => {
    expect(ftePercent(null, '48')).toBe('100.00');
    expect(ftePercent('24.0', '48')).toBe('50.00');
    expect(ftePercent('37.5', '40')).toBe('93.75');
    expect(ftePercent('20', '48')).toBe('41.67');
  });
});
