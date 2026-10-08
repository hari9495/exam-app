import { forecast, ragOf, safeCell, toCsv, nextRun } from './reports.service';
import { healthScore, prefixQuery, renderBlocks, slugify } from './kb.service';
import { npsOf } from './surveys.service';
import { ldapUser, scimUser } from './directory.service';

// Batch 4 pure logic (SD-1.24 … SD-1.29): search words, addresses, blocks, health, NPS, KPI colours and forecasts,
// formula-safe CSV, directory user mapping.
describe('knowledge helpers', () => {
  it('turns typed words into a safe prefix search; operators and quotes never get through', () => {
    expect(prefixQuery('Printer  jam')).toBe('printer & jam:*');
    expect(prefixQuery("vpn' | !x & (y)")).toBe('vpn & x & y:*');
    expect(prefixQuery('पेरोल स्लिप', '|')).toBe('पेरोल | स्लिप:*');
    expect(prefixQuery('  !!  ')).toBeNull();
  });

  it('makes web addresses from titles, with the number for other scripts', () => {
    expect(slugify('How do I reset my VPN password?', 7)).toBe('how-do-i-reset-my-vpn-password');
    expect(slugify('पेरोल', 12)).toBe('article-12');
  });

  it('shows the current text of a block and drops unknown ones', () => {
    expect(renderBlocks('<p>Visit {{block:office}} or {{ block:nope }}.</p>', new Map([['office', '<strong>MG Road</strong>']]))).toBe('<p>Visit <strong>MG Road</strong> or .</p>');
  });

  it('scores health from use, feedback and flags', () => {
    expect(healthScore({ views: 0, solved: 0, yes: 0, no: 0, outdated: false, reviewOverdue: false })).toBe(50);
    expect(healthScore({ views: 400, solved: 10, yes: 10, no: 0, outdated: false, reviewOverdue: false })).toBe(100);
    expect(healthScore({ views: 0, solved: 0, yes: 0, no: 5, outdated: true, reviewOverdue: true })).toBe(0);
  });
});

describe('surveys and reports', () => {
  it('works out NPS', () => {
    expect(npsOf([10, 9, 8, 7, 6, 0])).toEqual({ nps: 0, promoters: 2, passives: 2, detractors: 2 });
    expect(npsOf([]).nps).toBeNull();
  });

  it('colours KPIs both ways', () => {
    expect(ragOf(95, { target: 90, amber: 80, higherIsBetter: true })).toBe('green');
    expect(ragOf(85, { target: 90, amber: 80, higherIsBetter: true })).toBe('amber');
    expect(ragOf(5, { target: 2, amber: 4, higherIsBetter: false })).toBe('red');
    expect(ragOf(5, null)).toBeNull();
  });

  it('forecasts a straight line and never below zero', () => {
    expect(forecast([1, 2, 3, 4], 2)).toEqual([5, 6]);
    expect(forecast([5, 3, 1], 3)).toEqual([0, 0, 0]);
    expect(forecast([1, 2], 3)).toEqual([]);
  });

  it('never lets a spreadsheet run a cell as a formula', () => {
    expect(['=SUM(A1)', '+1', '-2', '@x', '\tA', 'fine', null].map(safeCell)).toEqual(["'=SUM(A1)", "'+1", "'-2", "'@x", "'\tA", 'fine', '']);
    expect(toCsv(['=Name'], [['=HYPERLINK("x")']])).toBe('\'=Name\n"\'=HYPERLINK(""x"")"\n');
  });

  it('schedules the next run at 07:00 India time', () => {
    expect(nextRun('daily', new Date('2026-10-08T10:00:00Z')).toISOString()).toBe('2026-10-09T01:30:00.000Z');
    expect(nextRun('monthly', new Date('2026-12-20T10:00:00Z')).toISOString()).toBe('2027-01-01T01:30:00.000Z');
  });
});

describe('directory users', () => {
  it('reads an AD entry: disabled bit, groups by CN, email required', () => {
    const u = ldapUser({ dn: 'cn=Anil,ou=x', mail: 'Anil@Acme.test', givenName: 'Anil', sn: 'Rao', department: 'IT', memberOf: ['CN=Desk Agents,OU=Groups,DC=acme', 'CN=All,DC=acme'], userAccountControl: '514', objectGUID: Buffer.from([1, 2]) });
    expect(u).toMatchObject({ email: 'anil@acme.test', givenName: 'Anil', familyName: 'Rao', department: 'IT', groups: ['Desk Agents', 'All'], active: false, externalId: '0102' });
    expect(ldapUser({ dn: 'cn=svc', cn: 'svc' })).toBeNull();
  });

  it('reads a SCIM user and refuses a userName that is not an email', () => {
    expect(scimUser({ userName: 'Meera@Acme.test', name: { givenName: 'Meera', familyName: 'Iyer' }, active: false, externalId: 'okta-1', 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': { department: 'Finance' } }, 'x')).toMatchObject({ email: 'meera@acme.test', active: false, externalId: 'okta-1', department: 'Finance' });
    expect(() => scimUser({ userName: 'not-an-email' }, 'x')).toThrow();
  });
});
