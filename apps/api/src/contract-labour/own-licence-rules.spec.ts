import { coverOf, daysPresent, packDue, packState, placementBlock, type OwnLicenceLike } from './own-licence-rules';

const lic = (over: Partial<OwnLicenceLike> = {}): OwnLicenceLike => ({ id: 'l1', licenceNo: 'TN/OSH/CL/2026/2211', clientSiteId: 's1', states: ['IN-TN'], maxWorkers: 50, validFrom: '2026-01-01', validTo: '2027-03-31', status: 'verified', ...over });

describe('own licence rules (CL-8)', () => {
  it('the site’s own licence first, else a single licence for the state; only verified and in force', () => {
    const site = { id: 's1', state: 'IN-TN' };
    const single = lic({ id: 'l2', clientSiteId: null, licenceNo: 'TN/SINGLE' });
    expect(coverOf([single, lic()], site, '2026-06-01')!.id).toBe('l1');
    expect(coverOf([single], site, '2026-06-01')!.id).toBe('l2');
    expect(coverOf([single], { id: 's9', state: 'IN-KL' }, '2026-06-01')).toBeNull();
    expect(coverOf([lic({ status: 'pending' })], site, '2026-06-01')).toBeNull();
    expect(coverOf([lic()], site, '2027-04-01')).toBeNull();
  });

  it('the 51st under a licence of 50 is blocked; the 50th is not', () => {
    expect(placementBlock({ licence: lic(), deployed: 49, threshold: 50, site: 'Ambattur' })).toBeNull();
    expect(placementBlock({ licence: lic(), deployed: 50, threshold: 50, site: 'Ambattur' })).toMatch(/allows 50 at Ambattur; 50 are placed/);
  });

  it('without a licence: allowed below the state threshold, blocked at it', () => {
    expect(placementBlock({ licence: null, deployed: 48, threshold: 50, site: 'Kochi' })).toBeNull();
    expect(placementBlock({ licence: null, deployed: 49, threshold: 50, site: 'Kochi' })).toMatch(/No licence of ours covers Kochi/);
    expect(placementBlock({ licence: null, deployed: 200, threshold: null, site: 'Kochi' })).toBeNull();
  });

  it('a pack is due on the site’s day of the next month; its state', () => {
    expect(packDue('2026-09', 10)).toBe('2026-10-10');
    expect(packDue('2026-12', 15)).toBe('2027-01-15');
    expect(packState({ uploadedOn: null, acceptedAt: null }, '2026-10-10', '2026-10-09')).toBe('Generated');
    expect(packState({ uploadedOn: null, acceptedAt: null }, '2026-10-10', '2026-10-11')).toBe('Overdue');
    expect(packState({ uploadedOn: '2026-10-08', acceptedAt: null }, '2026-10-10', '2026-10-20')).toBe('Uploaded');
    expect(packState({ uploadedOn: '2026-10-08', acceptedAt: '2026-10-09' }, '2026-10-10', '2026-10-20')).toBe('Accepted');
  });

  it('days present count half days as half', () => {
    expect(daysPresent(['present', 'half_day', 'absent', 'leave', 'present'])).toBe(2.5);
  });
});
