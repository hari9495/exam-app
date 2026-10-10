import { NET_PAY, UNMAPPED, buildJournal, type JournalSlip, type Mapping } from './ledger';

const E1 = 'entity-1';
const CC_A = 'cc-a';
const CC_B = 'cc-b';
const slip = (over: Partial<JournalSlip> = {}): JournalSlip => ({
  legalEntityId: E1,
  costCentres: [],
  lines: [
    { code: 'basic', kind: 'earning', amount: '50000.00' },
    { code: 'pf_employee', kind: 'deduction', amount: '1800.00' },
    { code: 'pf_employer', kind: 'employer', amount: '1800.00' },
  ],
  ...over,
});
const company = (componentCode: string, side: Mapping['side'], accountCode: string): Mapping => ({ scopeType: 'company', scopeId: null, componentCode, side, accountCode, accountName: accountCode });
const ALL: Mapping[] = [
  company('basic', 'expense', '5100'),
  company('pf_employee', 'payable', '2200'),
  company('pf_employer', 'expense', '5200'),
  company('pf_employer', 'payable', '2200'),
  company(NET_PAY, 'payable', '2100'),
];

describe('ledger mapping and the journal (GP-PAY-1)', () => {
  it('a fully mapped journal balances and has nothing unmapped', () => {
    const j = buildJournal([slip()], ALL);
    expect(j.unmapped).toEqual([]);
    expect(j.balanced).toBe(true);
    expect(j.lines.map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['2100', '0.00', '48200.00'],
      ['2200', '0.00', '3600.00'],
      ['5100', '50000.00', '0.00'],
      ['5200', '1800.00', '0.00'],
    ]);
  });

  it('anything without an account goes to Unmapped (still balanced, so nothing is lost) and is listed', () => {
    const j = buildJournal(
      [slip()],
      ALL.filter((m) => m.componentCode !== 'pf_employer'),
    );
    expect(j.balanced).toBe(true);
    expect(j.lines.find((l) => l.accountCode === UNMAPPED)).toMatchObject({ debit: '1800.00', credit: '1800.00' });
    expect(j.unmapped.map((u) => [u.componentCode, u.side])).toEqual([
      ['pf_employer', 'expense'],
      ['pf_employer', 'payable'],
    ]);
  });

  it('the most specific mapping wins: cost centre, then legal entity, then the company default; amounts split by cost centre', () => {
    const mappings = [
      ...ALL,
      { ...company('basic', 'expense', '5110'), scopeType: 'legal_entity' as const, scopeId: E1 },
      { ...company('basic', 'expense', '5120'), scopeType: 'cost_centre' as const, scopeId: CC_A },
    ];
    const j = buildJournal(
      [
        slip({
          costCentres: [
            { id: CC_A, percent: '33.33' },
            { id: CC_B, percent: '66.67' },
          ],
        }),
      ],
      mappings,
    );
    expect(j.lines.find((l) => l.accountCode === '5120')).toMatchObject({ costCentreId: CC_A, debit: '16665.00' });
    expect(j.lines.find((l) => l.accountCode === '5110')).toMatchObject({ costCentreId: CC_B, debit: '33335.00' });
    expect(j.balanced).toBe(true);
    // Another entity falls back to the company default.
    expect(buildJournal([slip({ legalEntityId: 'entity-2' })], mappings).lines.find((l) => l.accountCode === '5100')?.debit).toBe('50000.00');
  });
});
