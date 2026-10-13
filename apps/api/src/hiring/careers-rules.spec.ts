import { checkConsents, ipHash, isSlug, jobSlug, safeColor } from './careers-rules';

describe('careers rules (AT3)', () => {
  it('job slugs are ASCII, readable and carry a stable id part', () => {
    expect(jobSlug('Senior Accountant', 'Chennai', '7f3k2a99-0000-0000-0000-000000000000')).toBe('senior-accountant-chennai-7f3k2a');
    expect(jobSlug('Ingénieur — Qualité / R&D', null, 'abcdef12-0000')).toBe('ingenieur-qualite-r-d-abcdef');
    expect(jobSlug('உதவியாளர்', 'சென்னை', 'abcdef12-0000')).toBe('job-abcdef');
    expect(isSlug(jobSlug('A'.repeat(300), 'B', 'abcdef12'))).toBe(false); // longer than an entity slug, but still slug-shaped
    expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(jobSlug('A'.repeat(300), 'B', 'abcdef12'))).toBe(true);
  });

  it('only #rrggbb colours reach the page', () => {
    expect(safeColor('#1A2b3C')).toBe('#1A2b3C');
    expect(safeColor('red;background:url(x)')).toBeNull();
    expect(safeColor('#fff')).toBeNull();
  });

  it('the IP is kept only as a salted hash', () => {
    expect(ipHash('1.2.3.4', 's')).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash('1.2.3.4', 's')).not.toBe(ipHash('1.2.3.4', 't'));
    expect(ipHash(null, 's')).toBeNull();
  });

  it('the application notice is required at its current version; a stale page is refused', () => {
    const notices = [{ id: 'a', purpose: 'application', version: 3 }, { id: 't', purpose: 'talent_pool', version: 1 }];
    expect(checkConsents(notices, []).problem).toMatch(/accept/);
    expect(checkConsents(notices, [{ purpose: 'application', version: 2 }])).toMatchObject({ stale: true });
    expect(checkConsents(notices, [{ purpose: 'application', version: 3 }]).record.map((r) => r.purpose)).toEqual(['application']);
    expect(checkConsents(notices, [{ purpose: 'application', version: 3 }, { purpose: 'talent_pool', version: 1 }]).record).toHaveLength(2);
    expect(checkConsents([], []).problem).toBeNull();
  });
});
