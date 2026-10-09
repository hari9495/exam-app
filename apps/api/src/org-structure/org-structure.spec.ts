import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { masterBody } from './dto';
import { addDays, addressProblem, codeFromName, gstinMatchesPan, isCidr, isCurrency, isTimeZone, regionProblem, todayIst } from './org-validation';
import { companyContext, mapDbError } from './org-structure.service';
import { resolveSetting, SETTINGS, SettingRow } from './settings-registry';

describe('P01 organisation structure: rules without a database', () => {
  describe('YX-ORG-30 region catalogue', () => {
    it('accepts only a live region that serves the country', () => {
      expect(regionProblem('IN', 'IN')).toBeNull();
      expect(regionProblem('EU', 'DE')).toMatch(/not open yet/);
      expect(regionProblem('IN', 'AE')).toMatch(/does not serve/);
      expect(regionProblem('MARS', 'IN')).toMatch(/Unknown/);
    });
  });

  describe('YX-ORG-28 structured addresses', () => {
    it('checks the country, the ISO 3166-2 state and the Indian PIN code', () => {
      expect(addressProblem({ country: 'IN', state: 'IN-KA', postalCode: '560025' })).toBeNull();
      expect(addressProblem({ country: 'IN', state: 'IN-XX' })).toMatch(/state/);
      expect(addressProblem({ country: 'IN', state: 'IN-TN', postalCode: '06001' })).toMatch(/PIN/);
      expect(addressProblem({ country: 'ZZ', state: 'ZZ-A' })).toMatch(/country/);
      expect(addressProblem({ country: 'AE', state: 'AE-DU' })).toBeNull();
      expect(addressProblem({ country: 'AE', state: 'IN-KA' })).toMatch(/state/);
    });

    it('YX-ORG-02: time zones are real IANA zones', () => {
      expect(isTimeZone('Asia/Kolkata')).toBe(true);
      expect(isTimeZone('Asia/Calcutta')).toBe(true);
      expect(isTimeZone('Mars/Olympus')).toBe(false);
      expect(isTimeZone("Asia/Kolkata'; DROP TABLE x")).toBe(false);
    });
  });

  it('statutory identifiers: a GSTIN carries the PAN; currencies and IP ranges are real', () => {
    expect(gstinMatchesPan('29AABCK1234M1Z5', 'AABCK1234M')).toBe(true);
    expect(gstinMatchesPan('29AABCK1234M1Z5', 'AABCK9999M')).toBe(false);
    expect(isCurrency('INR')).toBe(true);
    expect(isCurrency('XYZ')).toBe(false);
    expect(isCidr('203.0.113.0/24')).toBe(true);
    expect(isCidr('2001:db8::/32')).toBe(true);
    expect(isCidr('203.0.113.0')).toBe(false);
    expect(isCidr('999.0.0.0/8')).toBe(false);
  });

  it('YX-ORG-05: blank codes are generated from the name and never clash', () => {
    expect(codeFromName('Chennai Sales', new Set())).toBe('CHENNAI-SALES');
    expect(codeFromName('Chennai Sales', new Set(['CHENNAI-SALES', 'CHENNAI-SALES-2']))).toBe('CHENNAI-SALES-3');
    expect(codeFromName('R&D / Labs', new Set())).toBe('R-D-LABS');
    expect(codeFromName('—', new Set())).toBe('X');
    expect(codeFromName('A very long department name for testing', new Set()).length).toBeLessThanOrEqual(24);
  });

  it('dates: today is the IST calendar date; day arithmetic is calendar arithmetic', () => {
    expect(todayIst(new Date('2026-09-30T19:00:00Z'))).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  describe('YX-ORG-12 / YX-ORG-18 scoped settings', () => {
    const def = SETTINGS['attendance.mode'];
    const row = (scopeType: string, scopeId: string, value: string, validFrom: string): SettingRow => ({ id: `${scopeType}-${validFrom}`, scopeType, scopeId, value, validFrom });
    const rows = [
      row('tenant', 'org', 'punch', '2026-04-01'),
      row('legal_entity', 'tn', 'timesheet', '2026-04-01'),
      row('location', 'hosur', 'assumed_present', '2026-04-01'),
      row('location', 'hosur', 'punch', '2026-11-01'),
      row('department', 'qa', 'timesheet', '2026-04-01'),
    ];

    it('the most specific scope wins: department > location > entity > tenant > product default', () => {
      expect(resolveSetting(def, rows, { tenant: 'org', legal_entity: 'tn', location: 'hosur', department: 'qa' }, '2026-10-06')).toMatchObject({ value: 'timesheet', source: { scopeType: 'department' } });
      expect(resolveSetting(def, rows, { tenant: 'org', legal_entity: 'tn', location: 'hosur' }, '2026-10-06')).toMatchObject({ value: 'assumed_present', source: { scopeType: 'location' } });
      expect(resolveSetting(def, rows, { tenant: 'org', legal_entity: 'tn' }, '2026-10-06')).toMatchObject({ value: 'timesheet', source: { scopeType: 'legal_entity' } });
      expect(resolveSetting(def, rows, { tenant: 'org', legal_entity: 'kfpl' }, '2026-10-06')).toMatchObject({ value: 'punch', source: { scopeType: 'tenant' } });
      expect(resolveSetting(def, [], { tenant: 'org' }, '2026-10-06')).toEqual({ value: 'punch', source: { scopeType: 'default' } });
    });

    it('dated values resolve as of the date processed: future values wait, past periods keep theirs', () => {
      const ctx = { tenant: 'org', legal_entity: 'tn', location: 'hosur' };
      expect(resolveSetting(def, rows, ctx, '2026-10-31').value).toBe('assumed_present');
      expect(resolveSetting(def, rows, ctx, '2026-11-01').value).toBe('punch');
      // Before 1 Apr nothing was in force: the product default applies.
      expect(resolveSetting(def, rows, ctx, '2026-03-31')).toEqual({ value: 'punch', source: { scopeType: 'default' } });
    });

    it('a scope the key does not allow is ignored', () => {
      const tenantOnly = SETTINGS['employee_code.scope'];
      expect(resolveSetting(tenantOnly, [{ id: 'x', scopeType: 'legal_entity', scopeId: 'tn', value: 'tenant', validFrom: null }], { tenant: 'org', legal_entity: 'tn' }, null).value).toBe('legal_entity');
    });
  });

  describe('master bodies are validated per kind (whitelist, no extras)', () => {
    it('accepts a valid body and rejects unknown, wrong-kind and malformed fields', () => {
      expect(masterBody('grades', { name: 'G1', rank: 3 })).toMatchObject({ name: 'G1', rank: 3 });
      expect(() => masterBody('grades', { name: 'G1' })).toThrow(BadRequestException);
      expect(() => masterBody('designations', { name: 'X', rank: 3 })).toThrow(BadRequestException);
      expect(() => masterBody('departments', { name: 'X', parentId: 'not-a-uuid' })).toThrow(BadRequestException);
      expect(() => masterBody('departments', { name: 'X', code: 'a b' })).toThrow(BadRequestException);
      expect(() => masterBody('employment-types', { name: 'X', category: 'slave' })).toThrow(BadRequestException);
      expect(() => masterBody('cost-centres', { name: 'X', ownerLegalEntityId: '00000000-0000-4000-8000-000000000000', legalEntityId: '00000000-0000-4000-8000-000000000000' })).toThrow(BadRequestException);
      expect(() => masterBody('grades', ['x'])).toThrow(BadRequestException);
    });
  });

  it('P01 §5 #2: platform staff never get the RLS bypass here, and a company is required', () => {
    expect(companyContext({ organizationId: 'org-1', isSuperAdmin: true, userId: 'u' })).toEqual({ organizationId: 'org-1', isSuperAdmin: false, userId: 'u', role: null });
    expect(() => companyContext({ organizationId: null, isSuperAdmin: true })).toThrow(ForbiddenException);
  });

  it('database refusals become 409s in plain words', () => {
    const known = (code: string, modelName: string) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '5', meta: { modelName, target: null } });
    expect(mapDbError(known('P2002', 'Department'))).toEqual(new ConflictException('That name or code is already used (YX-ORG-05).'));
    expect(mapDbError(known('P2002', 'LegalEntity'))).toEqual(new ConflictException('Another legal entity already has that short name.'));
    expect(mapDbError(known('P2003', 'Location'))).toEqual(new ConflictException('It is in use, so it can only be archived (YX-ORG-04).'));
    expect(mapDbError(new Error('conflicting key value violates exclusion constraint "grade_pay_ranges_no_overlap"'))).toBeInstanceOf(ConflictException);
    const other = new Error('boom');
    expect(mapDbError(other)).toBe(other);
  });
});
