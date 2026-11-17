import { Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { checkShape, due, inForce, runGolden, type GoldenCase, type RuleSet } from '../statutory/evaluator';
import { form16LinkProblem } from './form16-link';
import { registerAmounts, setupMissing } from './statutory-filings.service';
import { deskTaskSeats } from './statutory-registers.service';

// CMP statutory gaps: register amounts per statute, the Form 16 return link rule, the set-up-needed list, the desks a
// reviewer may put a task on, and the Q4 return date pack.

const D = (x: string) => new Prisma.Decimal(x);

describe('registerAmounts (CMP-03)', () => {
  const lines: Record<string, string> = { pf_employee: '1800', eps_employer: '1250', pf_employer: '550', esi_employee: '150', esi_employer: '650', pt: '200', lwf_employee: '50', lwf_employer: '100' };
  const sum = (k: string) => D(lines[k] ?? '0');
  it('EPF shows the employee share, EPS and the EPF employer share apart; the employer total adds them', () => {
    expect(registerAmounts('epf', sum)).toEqual({ employee: '1800.00', employer: '1800.00', eps: '1250.00', epfEmployer: '550.00' });
  });
  it('ESIC, PT (no employer share) and LWF', () => {
    expect(registerAmounts('esic', sum)).toEqual({ employee: '150.00', employer: '650.00', eps: null, epfEmployer: null });
    expect(registerAmounts('pt', sum)).toEqual({ employee: '200.00', employer: '0.00', eps: null, epfEmployer: null });
    expect(registerAmounts('lwf', sum)).toEqual({ employee: '50.00', employer: '100.00', eps: null, epfEmployer: null });
  });
  it('nothing on the payslip is zero, not missing', () => {
    expect(registerAmounts('epf', () => D('0'))).toEqual({ employee: '0.00', employer: '0.00', eps: '0.00', epfEmployer: '0.00' });
  });
});

describe('form16LinkProblem (CMP-06)', () => {
  const q4 = { taxYear: '2025-26', quarter: 4, status: 'filed', kind: 'original' };
  it('the year’s filed original Q4 return is fine', () => expect(form16LinkProblem(q4, '2025-26')).toBeNull());
  it('another quarter blocks, naming both quarters’ months', () => {
    expect(form16LinkProblem({ ...q4, quarter: 2 }, '2025-26')).toBe('The return you chose is Q2 (Jul 2025 to Sept 2025). Certificates need the filed Q4 return (Jan 2026 to Mar 2026).');
  });
  it('another tax year, a correction or an unfiled return blocks', () => {
    expect(form16LinkProblem({ ...q4, taxYear: '2024-25' }, '2025-26')).toMatch(/tax year 2024-25/);
    expect(form16LinkProblem({ ...q4, kind: 'correction' }, '2025-26')).toMatch(/correction/);
    expect(form16LinkProblem({ ...q4, status: 'validated' }, '2025-26')).toMatch(/not marked filed/);
  });
});

describe('setupMissing (CMP-01)', () => {
  const rules = [{ statute: 'IN.PT', jurisdiction: 'IN-KA' }, { statute: 'IN.LWF', jurisdiction: 'IN-KA' }, { statute: 'IN.PT', jurisdiction: 'IN-MH' }] as unknown as RuleSet[];
  const tx = (regs: { statute: string; state: string }[], tan: string | null, states: string[]) =>
    ({
      statutoryRegistration: { findMany: async () => regs },
      legalEntity: { findFirstOrThrow: async () => ({ tan }) },
      location: { findMany: async () => states.map((state) => ({ state })) },
    }) as never;
  it('nothing recorded: every statute, and PT / LWF only where a state charges them', async () => {
    expect(await setupMissing(tx([], null, ['IN-KA', 'IN-GJ']), 'o', 'e', rules)).toEqual(['IN.PF', 'IN.ESI', 'IN.TDS', 'IN.PT IN-KA', 'IN.LWF IN-KA']);
  });
  it('"not registered" counts as recorded; a TAN on the entity covers TDS', async () => {
    const regs = [
      { statute: 'IN.PF', state: '' },
      { statute: 'IN.ESI', state: '' },
      { statute: 'IN.PT', state: 'IN-KA' },
      { statute: 'IN.LWF', state: 'IN-KA' },
    ];
    expect(await setupMissing(tx(regs, 'BLRP12345E', ['IN-KA']), 'o', 'e', rules)).toEqual([]);
    expect(await setupMissing(tx(regs, 'BLRP12345E', ['IN-KA', 'IN-MH']), 'o', 'e', rules)).toEqual(['IN.PT IN-MH']);
  });
  it('2382: a state whose PT rule in force charges none (Haryana) asks for no PT registration; its LWF still does', async () => {
    const none = { statute: 'IN.PT', jurisdiction: 'IN-HR', version: '2025-v1', validFrom: '2025-04-01', verify: true, values: { kind: 'pt', basis: 'monthly', annualCap: '0', slabs: [] } } as RuleSet;
    const hrLwf = { statute: 'IN.LWF', jurisdiction: 'IN-HR' } as unknown as RuleSet;
    const regs = [{ statute: 'IN.PF', state: '' }, { statute: 'IN.ESI', state: '' }];
    expect(await setupMissing(tx(regs, 'BLRP12345E', ['IN-HR']), 'o', 'e', [...rules, none, hrLwf])).toEqual(['IN.LWF IN-HR']);
  });
});

describe('deskTaskSeats (CMP-08)', () => {
  const actor = (keys: string[], roles: [string, string][]) => ({ keys: new Set(keys), roles: new Map(roles) }) as never;
  it('agent and lead seats with the task key; never admin-only or collaborator seats, never without the key', () => {
    expect(deskTaskSeats(actor(['desk.task.work'], [['d1', 'agent'], ['d2', 'lead'], ['d3', 'admin'], ['d4', 'collaborator']]))).toEqual(['d1', 'd2']);
    expect(deskTaskSeats(actor([], [['d1', 'agent']]))).toEqual([]);
  });
});

describe('the Q4 return date pack (packs/in-tds-dates.json)', () => {
  const sets = (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in-tds-dates.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;
  it('passes its checks and golden cases, is marked verify, and gives 31 May after the tax year', () => {
    for (const rs of sets) expect([...checkShape(rs), ...rs.golden.flatMap((g) => runGolden(rs, g))]).toEqual([]);
    expect(sets.every((s) => s.verify)).toBe(true);
    const rs = inForce(sets, 'IN.TDS-DATES', ['IN'], '2027-03-01')!;
    expect(due(rs, { key: 'tds_return_q4', month: '2027-03' }).due).toBe('2027-05-31');
  });
});
