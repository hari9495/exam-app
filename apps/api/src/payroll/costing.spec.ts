import { NET_PAY, UNMAPPED, buildJournal, projectShares, reverseLines, type JournalLine, type JournalSlip, type Mapping } from './ledger';
import { journalFile } from './ledger.service';

// Enterprise E4 costing (O19-O22, answers 2653-2655): suspense, dimensions, project split, reversal and export formats.
const slip = (over: Partial<JournalSlip> = {}): JournalSlip => ({
  legalEntityId: 'e1',
  costCentres: [],
  departmentId: 'dep-sales',
  locationId: 'loc-blr',
  lines: [
    { code: 'basic', kind: 'earning', amount: '50000.00' },
    { code: 'pf_employee', kind: 'deduction', amount: '1800.00' },
  ],
  ...over,
});
const company = (componentCode: string, side: Mapping['side'], accountCode: string): Mapping => ({ scopeType: 'company', scopeId: null, componentCode, side, accountCode, accountName: `Acct ${accountCode}` });
const ALL = [company('basic', 'expense', '5100'), company('pf_employee', 'payable', '2200'), company(NET_PAY, 'payable', '2100')];
const SUSPENSE = { accountCode: '9999', accountName: 'Payroll suspense' };

describe('suspense (O20)', () => {
  it('unmapped amounts post to the suspense account, are still listed, and the journal balances (positive)', () => {
    const j = buildJournal([slip()], ALL.filter((m) => m.componentCode !== 'pf_employee'), { suspense: SUSPENSE });
    expect(j.lines.find((l) => l.accountCode === '9999')).toMatchObject({ credit: '1800.00', accountName: 'Payroll suspense' });
    expect(j.lines.some((l) => l.accountCode === UNMAPPED)).toBe(false);
    expect(j.unmapped).toEqual([{ componentCode: 'pf_employee', side: 'payable', costCentreId: null, amount: '1800.00' }]);
    expect(j.inSuspense).toBe('1800.00');
    expect(j.balanced).toBe(true);
  });
  it('without a suspense account they stay Unmapped, and nothing is in suspense (negative)', () => {
    const j = buildJournal([slip()], ALL.filter((m) => m.componentCode !== 'pf_employee'));
    expect(j.lines.find((l) => l.accountCode === UNMAPPED)).toMatchObject({ credit: '1800.00' });
    expect(j.inSuspense).toBe('0.00');
    expect(buildJournal([slip()], ALL, { suspense: SUSPENSE }).inSuspense).toBe('0.00');
  });
});

describe('dimensions and the project split (O21, O22)', () => {
  it('department and location are on every line; people in other departments get their own lines (positive)', () => {
    const j = buildJournal([slip(), slip({ departmentId: 'dep-ops' })], ALL);
    const basic = j.lines.filter((l) => l.accountCode === '5100');
    expect(basic.map((l) => [l.departmentId, l.locationId, l.debit])).toEqual([
      ['dep-ops', 'loc-blr', '50000.00'],
      ['dep-sales', 'loc-blr', '50000.00'],
    ]);
    expect(j.balanced).toBe(true);
  });
  it('by project hours the cost splits by project, keeping the main cost centre; the remainder goes to the last share (positive)', () => {
    const projects = projectShares(new Map([['p-b', 2000], ['p-a', 1000]]));
    expect(projects).toEqual([{ id: 'p-a', percent: '33.33' }, { id: 'p-b', percent: '66.67' }]);
    const j = buildJournal([slip({ costCentres: [{ id: 'cc-1', percent: '30' }, { id: 'cc-2', percent: '70' }], projects })], ALL, { split: 'project_hours' });
    const basic = j.lines.filter((l) => l.accountCode === '5100');
    expect(basic.map((l) => [l.projectId, l.costCentreId, l.debit])).toEqual([
      ['p-a', 'cc-2', '16665.00'],
      ['p-b', 'cc-2', '33335.00'],
    ]);
    expect(j.balanced).toBe(true);
  });
  it('no hours, or the cost-centre setting, keeps the cost-centre split; no minutes give no shares (negative)', () => {
    expect(projectShares(new Map())).toEqual([]);
    expect(projectShares(new Map([['p-a', 0]]))).toEqual([]);
    const cc = [{ id: 'cc-1', percent: '100' }];
    expect(buildJournal([slip({ costCentres: cc, projects: [] })], ALL, { split: 'project_hours' }).lines.every((l) => l.projectId === null)).toBe(true);
    expect(buildJournal([slip({ costCentres: cc, projects: [{ id: 'p-a', percent: '100' }] })], ALL, { split: 'cost_centre' }).lines.every((l) => l.projectId === null)).toBe(true);
  });
});

describe('reversal and export formats (O22)', () => {
  const lines: JournalLine[] = [
    { accountCode: '5100', accountName: 'Salaries', costCentreId: 'cc-1', departmentId: 'd', locationId: 'l', projectId: 'p', debit: '50000.00', credit: '0.00' },
    { accountCode: '2100', accountName: '=SUM(A1)', costCentreId: null, departmentId: 'd', locationId: 'l', projectId: null, debit: '0.00', credit: '50000.00' },
  ];
  const o = { month: '2026-10', postingDate: '2026-10-31', reference: 'PAYROLL-2026-10', text: 'Payroll 2026-10', cc: (id: string | null) => (id ? 'CC1' : ''), dept: () => 'SAL', loc: () => 'BLR', project: (id: string | null) => (id ? 'PRJ1' : ''), suffix: '' };
  it('a reversal swaps every debit and credit (positive)', () => {
    expect(reverseLines(lines).map((l) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['5100', '0.00', '50000.00'],
      ['2100', '50000.00', '0.00'],
    ]);
  });
  it('SAP uses posting key 40 / S for a debit and 50 / H for a credit, with the dimensions (positive)', () => {
    const { file, name } = journalFile('sap', lines, o);
    expect(name).toBe('payroll-journal-2026-10-sap.csv');
    const rows = file.trim().split('\r\n');
    expect(rows[1]).toContain(',40,"5100",50000.00,S,"CC1","SAL","BLR","PRJ1",');
    expect(rows[2]).toContain(',50,"2100",50000.00,H,"","SAL","BLR","",');
  });
  it('Oracle GL interface puts debits and credits in their own columns; CSV has the dimension columns (positive)', () => {
    const ora = journalFile('oracle', lines, o).file.trim().split('\r\n');
    expect(ora[0]).toContain('SEGMENT1_ACCOUNT,SEGMENT2_COST_CENTRE,SEGMENT3_DEPARTMENT,SEGMENT4_LOCATION,SEGMENT5_PROJECT,ENTERED_DR,ENTERED_CR');
    expect(ora[1]).toMatch(/,50000\.00,,PAYROLL-2026-10,/);
    expect(journalFile('csv', lines, o).file.split('\r\n')[0]).toBe('Account code,Account,Cost centre,Department,Location,Project,Debit,Credit');
  });
  it('a ledger name that starts like a formula cannot run in a spreadsheet, in any CSV format (negative)', () => {
    for (const f of ['csv', 'zoho', 'sap', 'oracle'] as const) {
      const file = journalFile(f, lines, o).file;
      expect(file).toContain(`"'=SUM(A1)"`);
      expect(file).not.toMatch(/(^|,)"?=SUM/m);
    }
  });
});
