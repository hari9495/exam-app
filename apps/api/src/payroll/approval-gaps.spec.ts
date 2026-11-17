import { readFileSync } from 'fs';
import { join } from 'path';
import { approvalGaps } from './runs.service';
import type { RuleSet } from '../statutory/evaluator';

// Batch H A2 (answers 2400-2402): what blocks a run's approval for the entity's records.
const rules = (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in.json'), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
const tx = (o: { tan?: string | null; pan?: string | null; country?: string; places: Record<string, string>; ptStates?: Record<string, string>; regs?: string[] }) =>
  ({
    $queryRaw: async () => [{ prev: null }],
    $executeRaw: async () => 0,
    legalEntity: { findFirstOrThrow: async () => ({ tan: o.tan ?? null, pan: o.pan ?? null, country: o.country ?? 'IN' }) },
    employeeStatutory: { findMany: async () => Object.entries(o.ptStates ?? {}).map(([employmentId, ptState]) => ({ employmentId, ptState })) },
    employeeAssignment: { findMany: async () => Object.entries(o.places).map(([employmentId, state]) => ({ employmentId, locationId: `loc-${state}` })) },
    location: { findMany: async () => [...new Set(Object.values(o.places))].map((state) => ({ id: `loc-${state}`, state })) },
    statutoryRegistration: { findMany: async () => (o.regs ?? []).map((state) => ({ state })) },
  }) as never;
const run = { legalEntityId: 'e', periodEnd: new Date('2026-10-31T00:00:00Z') };
const members = (...ids: string[]) => ids.map((employmentId) => ({ employmentId }));
const keys = async (o: Parameters<typeof tx>[0], ...ids: string[]) => (await approvalGaps(tx(o), 'o', run, members(...ids), rules)).map((g) => g.checkKey);

describe('approvalGaps (A2)', () => {
  it('TAN and PAN missing block; with both, nothing', async () => {
    expect(await keys({ places: {} })).toEqual(['entity_tan_missing', 'entity_pan_missing']);
    expect(await keys({ tan: 'BLRK12345E', pan: 'AAACK1234F', places: { a: 'IN-KA' }, regs: ['IN-KA'] }, 'a')).toEqual([]);
  });
  it('a PT registration only where the state charges PT and someone in the run works', async () => {
    const ok = { tan: 'T', pan: 'P' };
    expect(await keys({ ...ok, places: { a: 'IN-KA', b: 'IN-HR', c: 'IN-OD', d: 'IN-ML' } }, 'a', 'b', 'c', 'd')).toEqual(['pt_registration_IN-KA']);
    // A statutory profile's PT state wins over the place.
    expect(await keys({ ...ok, places: { a: 'IN-HR' }, ptStates: { a: 'IN-WB' } }, 'a')).toEqual(['pt_registration_IN-WB']);
    expect(await keys({ ...ok, places: { a: 'IN-KA' }, regs: ['IN-KA'] }, 'a')).toEqual([]);
  });
  it('an entity outside India is not checked', async () => {
    expect(await keys({ country: 'AE', places: { a: 'IN-KA' } }, 'a')).toEqual([]);
  });
});
