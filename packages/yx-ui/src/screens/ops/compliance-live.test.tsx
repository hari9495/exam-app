import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsultantTdsScreen, Form16BulkScreen, MissingIdsScreen, RegistersScreen, RulesBrowserScreen, StatutoryHubScreen } from './compliance';
import { hubItem, monthChoices, registerView, setupText, taxYearOf, type LiveConsultantTds, type LiveForm16, type LiveMissingIds, type LiveRegisters, type LiveRules, type LiveStatutoryHub } from './compliance-live';
import { CONSULTANT_RETURNS } from './compliance-data';
import { FILINGS, HUB, PEOPLE, RETURNS } from '../pay/live/fixtures-5j';
import { ADVISORIES, CERTIFICATES, ENTITIES, REGISTERS } from '../pay/live/fixtures-ops';
import { RULE_SETS } from '../pay/live/fixtures-5ab';
import type { Form16Status, RegisterRowsView } from '../pay/live/types-ops';
import type { TdsReturnRow } from '../pay/live/types-5j';

// The designed Compliance screens (CMP-01, 03, 04, 05, 06, 08, 13) with the live pages' data: positive and negative paths.
// Ported from the deleted live copies' tests (pay-ops-live.test.tsx, the statutory case of pay-5j-live.test.tsx).

const ue = userEvent.setup({ pointerEventsCheck: 0 });
const ok = () => vi.fn(async () => ({}) as never);
const refuse = (m: string) => vi.fn(async () => Promise.reject(new Error(m)));
const nameOf = (id: string) => PEOPLE.find((p) => p.employeeId === id)?.name ?? 'Someone';

const hub = (o: Partial<LiveStatutoryHub> = {}): LiveStatutoryHub => ({
  state: 'ready',
  entities: ENTITIES,
  entityId: 'e1',
  onEntity: vi.fn(),
  month: '2026-09',
  onMonth: vi.fn(),
  hub: HUB,
  filings: FILINGS,
  returns: RETURNS,
  can: { generate: true, markFiled: true, challan: true },
  challan: { id: 'ch1', status: 'prepared', tds: '12840.00', interest: '193.00' },
  onPrepareChallan: ok(),
  onDeposit: ok(),
  onGenerate: ok(),
  onUploaded: ok(),
  onFiled: ok(),
  onDownload: ok(),
  onCreateReturn: ok(),
  onImportMonth: vi.fn(async () => ({ id: 'b', kind: 'as_paid_lines' as const, rows: 0, valid: 0, errors: [], status: 'staged' })),
  onCommitImport: ok(),
  onReconcile: ok(),
  onReturnFile: ok(),
  onUploadFvu: ok(),
  onReturnFiled: ok(),
  ...o,
});
const showHub = (o?: Partial<LiveStatutoryHub>) => render(<StatutoryHubScreen items={[]} today={new Date()} live={hub(o)} />);

describe('CMP-01 statutory hub (live)', () => {
  it('a statute with nothing to pay is never overdue, and no stray 0 penalty shows', () => {
    const zero = { ...HUB.cards[0], amount: '0.00', status: 'not_generated', dueOn: '2026-01-15', late: true, penaltyEstimate: '0.00' } as (typeof HUB.cards)[number];
    showHub({ hub: { ...HUB, today: '2026-10-29', cards: [zero] }, filings: [] });
    const card = screen.getByRole('article', { name: new RegExp(zero.label) });
    expect(within(card).getAllByText('Nothing due').length).toBeGreaterThan(0);
    expect(within(card).queryByText(/Overdue/)).toBeNull();
    expect(within(card).queryByText(/^0$/)).toBeNull();
  });

  it('helpers: tax year of a month, month choices keep an old month, a hub card becomes a statute card', () => {
    expect(taxYearOf('2026-09')).toBe('2026-27');
    expect(taxYearOf('2027-02')).toBe('2026-27');
    expect(monthChoices('2020-01', new Date(2026, 9, 1)).map((m) => m.value)).toEqual(expect.arrayContaining(['2026-10', '2025-11', '2020-01']));
    const item = hubItem(HUB.cards[0], FILINGS[0], '2026-09', 'Kaveri');
    expect(item).toMatchObject({ statute: 'PF', step: 'uploaded', amount: 45210, reference: 'Portal reference TRRN-5554443' });
    expect(hubItem({ ...HUB.cards[1], dueOn: null }, null, '2026-09', 'K').due).toEqual(new Date(2026, 9, 15));
  });

  it('cards: an uploaded filing is marked filed only with its typed phrase', async () => {
    const onFiled = ok();
    showHub({ onFiled });
    expect(screen.getByRole('article', { name: /Provident fund/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Mark filed' }));
    const confirm = screen.getAllByRole('button', { name: 'Mark filed' }).pop()!;
    await ue.click(confirm);
    expect(onFiled).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'FILED PF 2026-09');
    await ue.click(confirm);
    await waitFor(() => expect(onFiled).toHaveBeenCalledWith('fl1', expect.objectContaining({ phrase: 'FILED PF 2026-09' })));
    expect((await screen.findAllByText('Provident fund for September 2026 is filed.')).length).toBeGreaterThan(0);
  });

  it('cards: generate a file says so; a refusal shows the server message', async () => {
    const onGenerate = ok();
    const { unmount } = showHub({ onGenerate });
    await ue.click(screen.getByRole('button', { name: 'Generate file' }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(HUB.cards[1]));
    expect((await screen.findAllByText('ESI file made.')).length).toBeGreaterThan(0);
    unmount();
    showHub({ onGenerate: refuse('Approve the month’s payroll first.') });
    await ue.click(screen.getByRole('button', { name: 'Generate file' }));
    expect(await screen.findByText('Approve the month’s payroll first.')).toBeInTheDocument();
  });

  it('cards: mark uploaded pressed too early shows the field error and sends nothing', async () => {
    const onUploaded = ok();
    showHub({ onUploaded });
    await ue.click(screen.getByRole('button', { name: 'Mark uploaded' }));
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findAllByText('Enter the portal reference (TRRN or challan number).')).length).toBeGreaterThan(0);
    expect(onUploaded).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Portal reference/ }), 'TRRN-77788');
    await ue.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('fl2', 'TRRN-77788'));
  });

  it('CMP-04 challan sheet: pressed too early focuses the BSR code; then records the deposit', async () => {
    const onDeposit = ok();
    showHub({ onDeposit });
    await ue.click(screen.getByRole('button', { name: 'Open challan sheet' }));
    const sheet = await screen.findByRole('dialog', { name: /TDS challan/ });
    await ue.click(within(sheet).getByRole('button', { name: 'Save challan' }));
    expect(within(sheet).getByText('The BSR code is 7 digits.')).toBeInTheDocument();
    expect(onDeposit).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByRole('textbox', { name: /BSR code/ }), '0510308');
    await ue.type(within(sheet).getByRole('textbox', { name: /Challan serial number/ }), '11207');
    await ue.type(within(sheet).getByRole('textbox', { name: /Deposit date/ }), '06/10/2026{Enter}');
    await ue.click(within(sheet).getByRole('button', { name: 'Save challan' }));
    await waitFor(() => expect(onDeposit).toHaveBeenCalledWith('ch1', expect.objectContaining({ bsrCode: '0510308', challanNo: '11207' })));
  });

  it('CMP-04 founder answer 23: a changed amount needs a reason (focus there), then goes with the deposit; payroll\'s figure is shown', async () => {
    const onDeposit = ok();
    showHub({ onDeposit });
    await ue.click(screen.getByRole('button', { name: 'Open challan sheet' }));
    const sheet = await screen.findByRole('dialog', { name: /TDS challan/ });
    const amount = within(sheet).getByRole('textbox', { name: /TDS deducted/ });
    await ue.clear(amount);
    await ue.type(amount, '11640');
    expect(within(sheet).getByText('Payroll says ₹12,840.00')).toBeInTheDocument();
    await ue.type(within(sheet).getByRole('textbox', { name: /BSR code/ }), '0510308');
    await ue.type(within(sheet).getByRole('textbox', { name: /Challan serial number/ }), '11207');
    await ue.type(within(sheet).getByRole('textbox', { name: /Deposit date/ }), '06/10/2026{Enter}');
    await ue.click(within(sheet).getByRole('button', { name: 'Save challan' }));
    expect(onDeposit).not.toHaveBeenCalled();
    expect(within(sheet).getByRole('textbox', { name: /Reason for changing the amount/ })).toHaveFocus();
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason for changing the amount/ }), 'One person paid TDS by self-assessment');
    await ue.click(within(sheet).getByRole('button', { name: 'Save challan' }));
    await waitFor(() => expect(onDeposit).toHaveBeenCalledWith('ch1', expect.objectContaining({ tds: '11640.00', reason: 'One person paid TDS by self-assessment', bsrCode: '0510308' })));
  });

  it('CMP-04: the server refusing one\'s own correction shows in plain words; the sheet stays open', async () => {
    showHub({ onDeposit: refuse('You prepared this challan, so someone else in payroll corrects its amount.') });
    await ue.click(screen.getByRole('button', { name: 'Open challan sheet' }));
    const sheet = await screen.findByRole('dialog', { name: /TDS challan/ });
    await ue.clear(within(sheet).getByRole('textbox', { name: /TDS deducted/ }));
    await ue.type(within(sheet).getByRole('textbox', { name: /TDS deducted/ }), '100');
    await ue.type(within(sheet).getByRole('textbox', { name: /Reason for changing the amount/ }), 'Typing error in payroll');
    await ue.type(within(sheet).getByRole('textbox', { name: /BSR code/ }), '0510308');
    await ue.type(within(sheet).getByRole('textbox', { name: /Challan serial number/ }), '11207');
    await ue.type(within(sheet).getByRole('textbox', { name: /Deposit date/ }), '06/10/2026{Enter}');
    await ue.click(within(sheet).getByRole('button', { name: 'Save challan' }));
    expect(await within(sheet).findByText(/someone else in payroll corrects its amount/)).toBeInTheDocument();
  });

  it('CMP-12 founder answer 22: a filed PF month shows its supplementary filing as a child card; the panel lists interest and damages and its actions', async () => {
    const onUploaded = ok();
    const child = { id: 'sf1', kind: 'supplementary' as const, status: 'generated', amount: '1800.00', reason: 'Arrears paid in October', people: 2, employeeShare: '900.00', employerShare: '900.00', causedBy: ['Divya Raghunathan', 'Arjun Kulkarni'], reference: null, fileId: 'ff9', correctsId: 'fl1', createdAt: '2026-10-20T10:00:00Z', penalties: [{ kind: '7Q', daysLate: 5, base: '1800.00', rate: '12', amount: '3.00', ruleVersion: 'IN.PENALTY@2026.1' }] };
    const pf = { ...HUB.cards[0], status: 'filed', children: [child] };
    showHub({ hub: { ...HUB, cards: [pf] }, filings: [{ ...FILINGS[0], status: 'filed' }], onUploaded, onCorrect: ok() });
    const childCard = screen.getByRole('article', { name: 'Supplementary ECR for September 2026' });
    await ue.click(within(childCard).getByRole('button', { name: 'Open filing' }));
    const panel = await screen.findByRole('dialog', { name: /Supplementary ECR · September 2026/ });
    expect(within(panel).getByText('Arrears paid in October')).toBeInTheDocument();
    expect(within(panel).getByText('Divya Raghunathan')).toBeInTheDocument();
    expect(within(panel).getByText('7Q')).toBeInTheDocument();
    await ue.click(within(panel).getByRole('button', { name: 'Mark uploaded' }));
    const ref = await screen.findByRole('dialog', { name: 'Uploaded on the portal' });
    await ue.type(within(ref).getByRole('textbox', { name: /Portal reference/ }), 'TRRN-99887');
    await ue.click(within(ref).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('sf1', 'TRRN-99887'));
  });

  it('CMP-12: "Correct this month" on a filed PF card: a supplementary filing needs a reason; an excess needs its amount', async () => {
    const onCorrect = ok();
    const pf = { ...HUB.cards[0], status: 'filed' };
    showHub({ hub: { ...HUB, cards: [pf, HUB.cards[2]] }, filings: [{ ...FILINGS[0], status: 'filed' }, FILINGS[1]], onCorrect });
    // Only PF and ESI are corrected here, as the design shows.
    expect(screen.getAllByRole('button', { name: 'Correct this month' })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Correct this month' }));
    const d = await screen.findByRole('dialog', { name: /Correct Provident fund/ });
    await ue.click(within(d).getByRole('button', { name: 'Make supplementary filing' }));
    expect(onCorrect).not.toHaveBeenCalled();
    expect(within(d).getAllByText('Say why, in at least 5 characters.').length).toBeGreaterThan(0);
    await ue.click(within(d).getByRole('radio', { name: 'Paid too much · refund' }));
    await ue.type(within(d).getByRole('textbox', { name: /Why/ }), 'Paid twice for one person');
    await ue.click(within(d).getByRole('button', { name: 'Record excess' }));
    expect(onCorrect).not.toHaveBeenCalled();
    expect(within(d).getAllByText('Enter the amount paid too much, in rupees.').length).toBeGreaterThan(0);
    await ue.type(within(d).getByRole('textbox', { name: /Amount paid too much/ }), '1500');
    await ue.click(within(d).getByRole('button', { name: 'Record excess' }));
    await waitFor(() => expect(onCorrect).toHaveBeenCalledWith(pf, { kind: 'excess_refund', reason: 'Paid twice for one person', amount: '1500' }));
  });

  it('read only: no make, upload or file buttons; no entity shows the choose state', () => {
    const { unmount } = showHub({ can: { generate: false, markFiled: false, challan: false } });
    expect(screen.queryByRole('button', { name: /Generate file|Mark uploaded|Mark filed|Prepare challan|Open challan sheet/ })).toBeNull();
    unmount();
    showHub({ entityId: null });
    expect(screen.getByText('Choose a legal entity.')).toBeInTheDocument();
  });

  it('states: loading, error and no access come from the page', () => {
    const { unmount } = showHub({ state: 'error' });
    expect(screen.getByText("We couldn't load statutory filings.")).toBeInTheDocument();
    unmount();
    showHub({ state: 'no-access' });
    expect(screen.queryByRole('tab', { name: 'Cards' })).toBeNull();
  });

  it('CMP-01 SetupNeeded: registrations missing and nothing owed shows what to register and opens payroll set-up', async () => {
    const onOpenSetup = vi.fn();
    const zero = HUB.cards.map((c) => ({ ...c, amount: '0.00', status: 'not_generated', filingId: null }));
    const setup = { ...HUB, setupMissing: ['IN.PF', 'IN.TDS', 'IN.PT IN-KA'], cards: zero, tds: { ...HUB.tds, amount: '0.00' } };
    const { unmount } = showHub({ hub: setup, filings: [], onOpenSetup });
    expect(screen.getByText('Statutory set-up needed.')).toBeInTheDocument();
    expect(screen.getByText('Add registrations for Provident fund, Income tax (TDS) and Professional tax (Karnataka) for Kaveri Foods Pvt Ltd. Cards appear here after the first payroll run.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open payroll set-up' }));
    expect(onOpenSetup).toHaveBeenCalled();
    unmount();
    // Without the set-up key there is no button; once something is owed the cards show instead.
    const { unmount: u2 } = showHub({ hub: setup, filings: [] });
    expect(screen.queryByRole('button', { name: 'Open payroll set-up' })).toBeNull();
    u2();
    showHub({ hub: { ...HUB, setupMissing: ['IN.PF'] } });
    expect(screen.queryByText('Statutory set-up needed.')).toBeNull();
    expect(screen.getByRole('article', { name: /Provident fund/ })).toBeInTheDocument();
    expect(setupText('IN.LWF IN-TN')).toBe('Labour welfare fund (Tamil Nadu)');
  });

  it('CMP-05 completeness: rows per month and PAN checks; a missing month blocks filing until its rows are imported', async () => {
    const completeness = {
      months: [
        { month: '2026-07', rows: 0, source: 'none' as const, missing: true },
        { month: '2026-08', rows: 5, source: 'payroll' as const, missing: false },
        { month: '2026-09', rows: 6, source: 'payroll' as const, missing: false },
      ],
      panWarnings: [{ employeeId: 'p2', employeeCode: 'KF-002', name: 'Nisha Thomas', issue: 'pan_missing' as const }],
      panWarningCount: 1,
      panChecked: 7,
    };
    const ret: TdsReturnRow = { ...RETURNS[0], status: 'validated', validation: { validator: 'filer', ok: true, errors: [] }, completeness };
    const onImportMonth = vi.fn(async () => ({ id: 'b1', kind: 'as_paid_lines' as const, rows: 2, valid: 1, errors: [{ row: 2, message: 'No employee with that code in this legal entity.' }], status: 'staged' }));
    const onCommitImport = ok();
    const onCreateReturn = ok();
    showHub({ returns: [ret], onImportMonth, onCommitImport, onCreateReturn });
    await ue.click(screen.getByRole('tab', { name: 'TDS returns' }));
    await ue.click(screen.getByRole('button', { name: 'Open Form 138 · Q2 2026-27' }));
    expect(screen.getByText(/July rows missing/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Data completeness/ }));
    const rows = screen.getByRole('list', { name: 'Deductee rows by month' });
    expect(within(rows).getByText('July 2026: no deductee rows')).toBeInTheDocument();
    expect(within(rows).getByText('August 2026: 5 deductee rows')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'PAN checks' })).getByText('Nisha Thomas: no PAN')).toBeInTheDocument();
    expect(screen.getByText('6 other PANs in order')).toBeInTheDocument();
    // Filing waits for the month.
    await ue.click(screen.getByRole('button', { name: /File and acknowledgement/ }));
    await ue.type(screen.getByRole('textbox', { name: /Token number/ }), 'TKN123456');
    await ue.click(screen.getAllByRole('button', { name: 'Mark return filed' })[0]);
    expect(screen.getByText('Import the as-paid lines for July 2026 first.')).toBeInTheDocument();
    // A bad row: reported plainly, nothing committed.
    await ue.click(screen.getByRole('button', { name: /Data completeness/ }));
    const csv = (text: string) => new File([text], 'july.csv', { type: 'text/csv' });
    await ue.upload((screen.getByRole('button', { name: 'Import the as-paid lines for July 2026' }).nextElementSibling as HTMLInputElement), csv('employeeCode,componentCode,amount\nKF-001,tds,1200\nNOPE,tds,5\n'));
    expect(await screen.findByText('Row 2: No employee with that code in this legal entity.')).toBeInTheDocument();
    expect(onImportMonth).toHaveBeenCalledWith('2026-07', [
      { employeeCode: 'KF-001', componentCode: 'tds', amount: '1200', month: '2026-07' },
      { employeeCode: 'NOPE', componentCode: 'tds', amount: '5', month: '2026-07' },
    ]);
    expect(onCommitImport).not.toHaveBeenCalled();
    // Every row right: committed, the draft started again with the rows, and a toast.
    onImportMonth.mockResolvedValueOnce({ id: 'b2', kind: 'as_paid_lines', rows: 1, valid: 1, errors: [], status: 'staged' });
    await ue.upload((screen.getByRole('button', { name: 'Import the as-paid lines for July 2026' }).nextElementSibling as HTMLInputElement), csv('employeeCode,componentCode,amount\nKF-001,tds,1200\n'));
    await waitFor(() => expect(onCommitImport).toHaveBeenCalledWith('b2'));
    await waitFor(() => expect(onCreateReturn).toHaveBeenCalledWith('2026-27', 2));
    expect((await screen.findAllByText('1 as-paid line imported for July 2026.')).length).toBeGreaterThan(0);
  });

  it('CMP-05 returns tab: the return waits for the filer’s .fvu; marking filed needs a validated return and a token', async () => {
    const onReturnFiled = ok();
    showHub({ onReturnFiled, returns: [RETURNS[0], { ...RETURNS[0], id: 't2', quarter: 1, status: 'validated', validation: { validator: 'filer', ok: true, errors: [], version: '9.2' } }] });
    await ue.click(screen.getByRole('tab', { name: 'TDS returns' }));
    await ue.click(screen.getByRole('button', { name: 'Open Form 138 · Q2 2026-27' }));
    expect(screen.getByRole('button', { name: 'Upload the .fvu for Form 138 Q2' })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /File and acknowledgement/ }));
    await ue.type(screen.getByRole('textbox', { name: /Token number/ }), 'TKN123456');
    await ue.click(screen.getAllByRole('button', { name: 'Mark return filed' })[0]);
    expect(screen.getByText(/Upload the .fvu file the FVU made first/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open Form 138 · Q1 2026-27' }));
    await ue.click(screen.getByRole('button', { name: /File and acknowledgement/ }));
    await ue.click(screen.getAllByRole('button', { name: 'Mark return filed' })[0]);
    expect(screen.getAllByText(/Enter the token number the portal gave/).length).toBeGreaterThan(0);
    await ue.type(screen.getByRole('textbox', { name: /Token number/ }), 'TKN123456');
    await ue.click(screen.getAllByRole('button', { name: 'Mark return filed' })[0]);
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'FILED 138 Q1 2026-27');
    await ue.click(screen.getAllByRole('button', { name: 'Mark filed' }).pop()!);
    await waitFor(() => expect(onReturnFiled).toHaveBeenCalledWith('t2', 'TKN123456', expect.objectContaining({ phrase: 'FILED 138 Q1 2026-27' })));
  });
});

const EPF_ROWS: RegisterRowsView = {
  kind: 'epf',
  month: '2026-09',
  rows: [
    { employeeId: 'p1', name: 'Divya Raghunathan', code: 'KF-001', location: 'Bengaluru head office', state: 'IN-KA', uanLast4: '0400', ipLast4: null, gross: '58000.00', pfWage: '15000', employee: '1800.00', employer: '1800.00', eps: '1250.00', epfEmployer: '550.00', coverage: 'covered', reason: null },
    { employeeId: 'p2', name: 'Karthik Subramanian', code: 'KF-002', location: 'Hosur plant', state: 'IN-TN', uanLast4: null, ipLast4: null, gross: '96000.00', pfWage: null, employee: '0.00', employer: '0.00', eps: '0.00', epfEmployer: '0.00', coverage: 'not_covered', reason: 'Not a PF member' },
  ],
  trend: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map((month) => ({ month, employee: '1800.00', employer: '1800.00' })),
};
const regs = (o: Partial<LiveRegisters> = {}): LiveRegisters => ({
  state: 'ready',
  entities: ENTITIES,
  entityId: 'e1',
  onEntity: vi.fn(),
  month: '2026-09',
  onMonth: vi.fn(),
  registers: REGISTERS,
  can: { generate: true, sign: true, download: true },
  onGenerate: ok(),
  onDownload: ok(),
  onFreeze: ok(),
  onSign: ok(),
  onPack: ok(),
  kind: 'epf',
  onKind: vi.fn(),
  rows: EPF_ROWS,
  ...o,
});

describe('CMP-03 registers (live)', () => {
  it('EPF person by person: coverage with its reason, IDs as last four, six months of totals; a tab asks for its rows', async () => {
    const onKind = vi.fn();
    const { unmount } = render(<RegistersScreen rows={[]} live={regs({ onKind })} />);
    const table = screen.getByRole('table', { name: 'EPF register' });
    expect(within(table).getByText('Not a PF member')).toBeInTheDocument();
    expect(within(table).getByText('•••• 0400')).toBeInTheDocument();
    expect(screen.getByText('EPF contributions, last 6 months')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: 'LWF' }));
    expect(onKind).toHaveBeenCalledWith('lwf');
    unmount();
    // Rows of another statute still loading: the table waits; none paid: it says so.
    const { unmount: u2 } = render(<RegistersScreen rows={[]} live={regs({ kind: 'esic' })} />);
    expect(screen.queryByText('Not a PF member')).toBeNull();
    u2();
    render(<RegistersScreen rows={[]} live={regs({ rows: { ...EPF_ROWS, rows: [] } })} />);
    expect(screen.getByText('No one was paid in September 2026 yet.')).toBeInTheDocument();
  });

  it('registerView: EPF shows the EPF employer share apart from EPS; not due keeps its reason', () => {
    const [a] = registerView(EPF_ROWS);
    expect(a).toMatchObject({ ee: 1800, eps: 1250, er: 550, pfWage: 15000, uan: '•••• 0400', coverage: 'Covered' });
    const lwf = registerView({ ...EPF_ROWS, kind: 'lwf', rows: [{ ...EPF_ROWS.rows[0], employee: '0.00', employer: '0.00', coverage: 'not_due', reason: 'LWF is deducted in December in Karnataka' }] });
    expect(lwf[0]).toMatchObject({ coverage: 'Not due', reason: 'LWF is deducted in December in Karnataka', er: 0 });
  });

  it('freezing asks first; a signed register only downloads', async () => {
    const onFreeze = ok();
    render(<RegistersScreen rows={[]} live={regs({ onFreeze })} />);
    await ue.click(screen.getByRole('tab', { name: 'Register files' }));
    expect(screen.getByRole('button', { name: 'Upload the signed Wages register' })).toBeInTheDocument();
    const signed = screen.getByRole('row', { name: /Overtime/ });
    expect(within(signed).getAllByRole('button')).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Freeze the Deductions register' }));
    expect(onFreeze).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Freeze' }));
    await waitFor(() => expect(onFreeze).toHaveBeenCalledWith(REGISTERS[1]));
  });

  it('a new version needs a reason; pressed empty it says so', async () => {
    const onGenerate = ok();
    render(<RegistersScreen rows={[]} live={regs({ onGenerate })} />);
    await ue.click(screen.getByRole('button', { name: 'Make a new version' }));
    await ue.click(screen.getByRole('button', { name: 'Make new version' }));
    expect((await screen.findAllByText('Say why, in at least 5 characters.')).length).toBeGreaterThan(0);
    expect(onGenerate).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Why/ }), 'Late overtime approval');
    await ue.click(screen.getByRole('button', { name: 'Make new version' }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith('Late overtime approval'));
  });

  it('empty month offers Make registers; without the keys there are no actions', async () => {
    const onGenerate = ok();
    const { unmount } = render(<RegistersScreen rows={[]} live={regs({ registers: [], onGenerate })} />);
    await ue.click(screen.getByRole('tab', { name: 'Register files' }));
    expect(screen.getByText('No register for September 2026 yet.')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Make registers' }));
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith());
    unmount();
    render(<RegistersScreen rows={[]} live={regs({ can: { generate: false, sign: false, download: false } })} />);
    expect(screen.queryByRole('button', { name: /Freeze|Make|Inspection|PDF|Upload/ })).toBeNull();
  });
});

const rules = (o: Partial<LiveRules> = {}): LiveRules => ({
  state: 'ready',
  entities: ENTITIES,
  entityId: 'e1',
  onEntity: vi.fn(),
  rules: RULE_SETS,
  advisories: ADVISORIES,
  can: { rules: true, updates: true },
  onReview: ok(),
  today: '2026-10-29',
  ...o,
});

describe('CMP-08 rules and updates (live)', () => {
  it('rules: read only, a rule opens its source and values', async () => {
    render(<RulesBrowserScreen rules={[]} advisories={[]} live={rules()} />);
    expect(screen.getByRole('table', { name: 'Statutory rule sets' })).toHaveTextContent('Provident fund');
    await ue.click(screen.getByRole('button', { name: 'Source and values of Professional tax 2026-v1' }));
    expect(await screen.findByText(/Marked verify/)).toBeInTheDocument();
    expect(screen.getByText('Karnataka Finance Act 2026')).toBeInTheDocument();
  });

  it('updates: marked reviewed with what was done; pressed empty it asks for it', async () => {
    const onReview = ok();
    render(<RulesBrowserScreen rules={[]} advisories={[]} tab="updates" live={rules({ onReview })} />);
    expect(screen.getAllByRole('button', { name: /^Mark ".*" reviewed$/ })).toHaveLength(1);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(screen.getAllByText('Say what you did, in at least 5 characters.').length).toBeGreaterThan(0);
    expect(onReview).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Raised two salaries in Mysuru');
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(ADVISORIES[0], 'Raised two salaries in Mysuru', {}));
  });

  it('updates: "Create a task" needs a desk seat, a desk and a due date; shared with HR admins', async () => {
    const onReview = vi.fn(async () => ({ taskError: null }));
    const { unmount } = render(<RulesBrowserScreen rules={[]} advisories={[]} tab="updates" live={rules({ onReview, taskDesks: [] })} />);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Raised two salaries in Mysuru');
    await ue.click(screen.getByRole('checkbox', { name: /Create a task/ }));
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(screen.getAllByText(/You have no seat on a help desk/).length).toBeGreaterThan(0);
    expect(onReview).not.toHaveBeenCalled();
    unmount();
    render(<RulesBrowserScreen rules={[]} advisories={[]} tab="updates" live={rules({ onReview, taskDesks: [{ id: 'd1', name: 'HR desk' }, { id: 'd2', name: 'Payroll desk' }] })} />);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Raised two salaries in Mysuru');
    await ue.click(screen.getByRole('checkbox', { name: /Create a task/ }));
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(screen.getAllByText('Choose the help desk for the task.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Choose when the task is due.').length).toBeGreaterThan(0);
    expect(onReview).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('checkbox', { name: /Create a task/ }));
    await ue.click(screen.getByRole('checkbox', { name: /Share with HR admins/ }));
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(ADVISORIES[0], 'Raised two salaries in Mysuru', { share: true }));
  });

  it('updates: a task the desk refused still marks the update reviewed and says so', async () => {
    const onReview = vi.fn(async () => ({ taskError: 'Reviewed, but the task was not made: Give tasks to people with a seat on this desk.' }));
    render(<RulesBrowserScreen rules={[]} advisories={[]} tab="updates" live={rules({ onReview, taskDesks: [{ id: 'd1', name: 'HR desk' }] })} />);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Raised two salaries in Mysuru');
    await ue.click(screen.getByRole('checkbox', { name: /Create a task/ }));
    await ue.type(screen.getByRole('textbox', { name: /Due on/ }), '30/10/2026{Enter}');
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(ADVISORIES[0], 'Raised two salaries in Mysuru', { task: { deskId: 'd1', dueOn: '2026-10-30' } }));
    expect((await screen.findAllByText(/the task was not made/)).length).toBeGreaterThan(0);
  });

  it('updates: only an https source becomes a link; a reviewer without set-up sees no Rules tab', () => {
    render(<RulesBrowserScreen rules={[]} advisories={[]} tab="updates" live={rules({ advisories: [ADVISORIES[0], { ...ADVISORIES[1], link: 'javascript:alert(1)' }], can: { rules: false, updates: true } })} />);
    expect(screen.getAllByRole('link', { name: 'Source' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://labour.karnataka.gov.in/');
    expect(screen.queryByRole('tab', { name: 'Rules' })).toBeNull();
  });

  it('updates: a refusal keeps the dialog open with the server message', async () => {
    render(<RulesBrowserScreen rules={[]} advisories={[]} tab="updates" live={rules({ onReview: refuse('This update is not for your legal entity.') })} />);
    await ue.click(screen.getByRole('button', { name: 'Mark "Karnataka minimum wages revised" reviewed' }));
    await ue.type(screen.getByRole('textbox', { name: /What you did/ }), 'Checked the wages');
    await ue.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    expect(await screen.findByText('This update is not for your legal entity.')).toBeInTheDocument();
  });
});

const f16 = (o: Partial<LiveForm16> = {}): LiveForm16 => ({
  state: 'ready',
  entities: ENTITIES,
  entityId: 'e1',
  onEntity: vi.fn(),
  taxYear: '2025-26',
  onTaxYear: vi.fn(),
  certificates: CERTIFICATES,
  q4Return: null,
  nameOf,
  can: { importZip: true, issueAll: true },
  onImportZip: vi.fn(async () => ({ files: 3, matched: 2, unmatched: ['ABCDE9999Z_Q4.pdf'] })),
  onPartA: ok(),
  onIssue: ok(),
  onIssueAll: vi.fn(async () => ({ issued: 1, failed: [] })),
  ...o,
});

describe('CMP-06 Form 16 (live)', () => {
  it('issuing everything ready needs the typed phrase', async () => {
    const onIssueAll = vi.fn(async () => ({ issued: 1, failed: [] }));
    render(<Form16BulkScreen rows={[]} live={f16({ onIssueAll })} />);
    await ue.click(screen.getByRole('button', { name: 'Issue 1 ready' }));
    const confirm = screen.getAllByRole('button', { name: 'Issue' }).pop()!;
    await ue.click(confirm);
    expect(screen.getAllByText(/exactly, in capitals\./).length).toBeGreaterThan(0);
    expect(onIssueAll).not.toHaveBeenCalled();
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'ISSUE FORM16 2025-26');
    await ue.click(confirm);
    await waitFor(() => expect(onIssueAll).toHaveBeenCalledWith(expect.objectContaining({ phrase: 'ISSUE FORM16 2025-26' })));
    expect((await screen.findAllByText('1 certificates issued.')).length).toBeGreaterThan(0);
    expect(screen.queryByText('1 issued')).toBeNull(); // done is a toast, not an inline alert
  });

  it('nothing ready: issue says why; without the key it says who may', async () => {
    const { unmount } = render(<Form16BulkScreen rows={[]} live={f16({ certificates: [CERTIFICATES[1]] })} />);
    await ue.click(screen.getByRole('button', { name: /Issue certificates/ }));
    await ue.click(screen.getByRole('button', { name: 'Issue 0 ready' }));
    expect(screen.getByText('No certificate is ready: attach Part A first.')).toBeInTheDocument();
    unmount();
    render(<Form16BulkScreen rows={[]} live={f16({ can: { importZip: false, issueAll: false } })} />);
    await ue.click(screen.getByRole('button', { name: 'Issue 1 ready' }));
    expect(screen.getByText('Only someone who signs for the company issues certificates.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the Q4 link shows the linked filed return; a filed Q4 not linked yet says so', () => {
    const q4 = { returnId: 't4', formCode: '138', taxYear: '2025-26', quarter: 4, status: 'filed', kind: 'original', tokenNo: 'TKN4' };
    const { unmount } = render(<Form16BulkScreen rows={[]} live={f16({ status: { taxYear: '2025-26', link: { ...q4, version: 1, problem: null }, q4, availableAfter: '2026-05-31' } })} />);
    expect(screen.getByText(/Linked: Form 138 Q4 2025-26, filed, token TKN4/)).toBeInTheDocument();
    unmount();
    render(<Form16BulkScreen rows={[]} live={f16({ q4Return: { ...RETURNS[0], quarter: 4, taxYear: '2025-26', status: 'filed', tokenNo: 'TKN4' } })} />);
    expect(screen.getByText(/Form 138 Q4 2025-26 is filed \(token TKN4\)\. Link it/)).toBeInTheDocument();
  });

  it('CMP-06 WrongQuarter: a Q2 link blocks issuing and says why; linking needs a return chosen', async () => {
    const q2 = { returnId: 't2', formCode: '138', taxYear: '2025-26', quarter: 2, status: 'filed', kind: 'original', tokenNo: 'TKN2' };
    const problem = 'The return you chose is Q2 (Jul 2025 to Sept 2025). Certificates need the filed Q4 return (Jan 2026 to Mar 2026).';
    const status: Form16Status = { taxYear: '2025-26', link: { ...q2, version: 3, problem }, q4: null, availableAfter: '2026-05-31' };
    const onLink = ok();
    const onIssueAll = vi.fn(async () => ({ issued: 1, failed: [] }));
    const salaryReturns = [{ ...RETURNS[0], id: 't4', taxYear: '2025-26', quarter: 4, status: 'filed', tokenNo: 'TKN4' }, { ...RETURNS[0], id: 'tx', taxYear: '2024-25' }];
    render(<Form16BulkScreen rows={[]} live={f16({ status, onLink, onIssueAll, salaryReturns })} />);
    await ue.click(screen.getByRole('button', { name: 'Issue 1 ready' }));
    expect(screen.getAllByText(problem).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Not a Q4 return/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /Link the Q4 return/ }));
    expect(screen.getAllByText(problem).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: 'Link return' }));
    expect(screen.getAllByText('Choose the return to link.').length).toBeGreaterThan(0);
    expect(onLink).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Link another return/ }));
    expect(screen.queryByRole('option', { name: /2024-25/ })).toBeNull();
    await ue.click(screen.getByRole('option', { name: /Form 138 · Q4 2025-26/ }));
    await ue.click(screen.getByRole('button', { name: 'Link return' }));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith('t4', 3));
    expect((await screen.findAllByText('Return linked to the certificates.')).length).toBeGreaterThan(0);
  });

  it('CMP-06 NotYetAvailable: no certificates before the Q4 return is filed, with the date; opens the year before', async () => {
    const onTaxYear = vi.fn();
    const { unmount } = render(<Form16BulkScreen rows={[]} live={f16({ taxYear: '2026-27', onTaxYear, certificates: [], status: { taxYear: '2026-27', link: null, q4: null, availableAfter: '2027-05-31' } })} />);
    expect(screen.getByText('Form 130 is available after the Q4 return is filed.')).toBeInTheDocument();
    expect(screen.getByText(/For tax year 2026-27 that is after 31 May 2027\./)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open Form 16 for 2025-26' }));
    expect(onTaxYear).toHaveBeenCalledWith('2025-26');
    unmount();
    // No date published: it still says why; with certificates the steps show.
    const { unmount: u2 } = render(<Form16BulkScreen rows={[]} live={f16({ certificates: [], status: { taxYear: '2025-26', link: null, q4: null, availableAfter: null } })} />);
    expect(screen.getByText('Employees see their monthly TDS in the tax workspace until then.')).toBeInTheDocument();
    u2();
    render(<Form16BulkScreen rows={[]} live={f16({ status: { taxYear: '2025-26', link: null, q4: null, availableAfter: '2026-05-31' } })} />);
    expect(screen.queryByText(/is available after the Q4 return is filed/)).toBeNull();
  });
});

const ctds = (o: Partial<LiveConsultantTds> = {}): LiveConsultantTds => ({
  state: 'ready',
  entities: ENTITIES,
  entityId: 'e1',
  onEntity: vi.fn(),
  returns: CONSULTANT_RETURNS,
  can: { view: true, challans: true, file: true, certificates: true },
  onPrepareChallans: vi.fn(async () => [{ section: '194J_B' as const, tds: '8400.00', status: 'draft' }]),
  onDraft: ok(),
  onReconcile: ok(),
  onMakeFile: ok(),
  onDownload: ok(),
  onFiled: ok(),
  onImport: vi.fn(async () => ({ formCode: '131', matched: [{ name: 'Asha Rao' }], unmatched: [] })),
  ...o,
});

describe('CMP-13 consultant TDS (live)', () => {
  it('a reconciled return with its file is marked filed with token and phrase', async () => {
    const onFiled = ok();
    render(<ConsultantTdsScreen live={ctds({ onFiled })} />);
    await ue.click(screen.getByRole('button', { name: 'Open Form 140 · Q2 2026-27' }));
    await ue.type(screen.getByRole('textbox', { name: /Token number/ }), 'TKN998877');
    await ue.click(screen.getAllByRole('button', { name: 'Mark return filed' })[0]);
    await ue.type(screen.getByRole('textbox', { name: /Type/ }), 'FILED 140 Q2 2026-27');
    await ue.click(screen.getAllByRole('button', { name: 'Mark filed' }).pop()!);
    await waitFor(() => expect(onFiled).toHaveBeenCalledWith(CONSULTANT_RETURNS[0], 'TKN998877', expect.objectContaining({ phrase: 'FILED 140 Q2 2026-27' })));
  });

  it('a draft return with a difference shows it and cannot be filed yet', async () => {
    render(<ConsultantTdsScreen live={ctds()} />);
    await ue.click(screen.getByRole('button', { name: 'Open Form 140 · Q3 2026-27' }));
    expect(screen.getAllByText(/Deposits differ from deductions/).length).toBeGreaterThan(0);
    await ue.click(screen.getByRole('button', { name: /File and acknowledgement/ }));
    await ue.type(screen.getByRole('textbox', { name: /Token number/ }), 'TKN998877');
    await ue.click(screen.getAllByRole('button', { name: 'Mark return filed' })[0]);
    expect(screen.getByText('Make the return file first.')).toBeInTheDocument();
  });

  it('challans: pressed with no month says so; then prepared per section', async () => {
    const onPrepareChallans = vi.fn(async () => [{ section: '194J_B' as const, tds: '8400.00', status: 'draft' }]);
    render(<ConsultantTdsScreen tab="challans" live={ctds({ onPrepareChallans })} />);
    await ue.click(screen.getByRole('button', { name: 'Prepare challans' }));
    expect(screen.getAllByText('Choose the month.').length).toBeGreaterThan(0);
    expect(onPrepareChallans).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /Month/ }));
    await ue.click(screen.getAllByRole('option')[1]);
    await ue.click(screen.getByRole('button', { name: 'Prepare challans' }));
    expect(await screen.findByText('Professional fees (194J(b))')).toBeInTheDocument();
  });

  it('a refusal shows the server message; read only has no challans, filing or certificates', async () => {
    const { unmount } = render(<ConsultantTdsScreen live={ctds({ onReconcile: refuse('This return is filed.') })} />);
    await ue.click(screen.getByRole('button', { name: 'Open Form 140 · Q3 2026-27' }));
    await ue.click(screen.getByRole('button', { name: 'Reconcile again' }));
    expect(await screen.findByText('This return is filed.')).toBeInTheDocument();
    unmount();
    render(<ConsultantTdsScreen live={ctds({ can: { view: true, challans: false, file: false, certificates: false } })} />);
    expect(screen.queryByRole('tab', { name: 'Challans' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start return' })).toBeNull();
  });
});

describe('CMP-07 Missing IDs (live, founder answer 22)', () => {
  const ROWS = [
    { id: 'p1:uan_missing', employeeId: 'p1', name: 'Divya Raghunathan', code: 'KF-001', department: 'Quality', issue: 'uan_missing' as const, blocks: true },
    { id: 'p2:pan_missing', employeeId: 'p2', name: 'Arjun Kulkarni', code: 'KF-002', department: null, issue: 'pan_missing' as const, blocks: false },
    { id: 'p3:bank_waiting', employeeId: 'p3', name: 'Lakshmi V', code: 'KF-003', department: 'HR', issue: 'bank_waiting' as const, blocks: true },
  ];
  const live = (o: Partial<LiveMissingIds> = {}): LiveMissingIds => ({ state: 'ready', entities: ENTITIES, entityId: 'e1', onEntity: vi.fn(), data: { entityId: 'e1', people: 40, counts: { pan: 1, uan: 1, esi: 0, bank: 1 }, rows: ROWS }, onOpenPerson: vi.fn(), ...o });

  it('counts per ID, drill-down to the people of one ID, and Fix opens the person', async () => {
    const onOpenPerson = vi.fn();
    render(<MissingIdsScreen rows={[]} live={live({ onOpenPerson })} />);
    const table = screen.getByRole('table', { name: 'People with missing or invalid IDs' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    await ue.click(screen.getByRole('link', { name: /View people without UAN/ }));
    expect(screen.getByText('Showing: UAN missing')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'People with missing or invalid IDs' })).getAllByRole('row')).toHaveLength(2);
    await ue.click(screen.getByRole('button', { name: 'Fix UAN missing for Divya Raghunathan' }));
    expect(onOpenPerson).toHaveBeenCalledWith('p1');
    await ue.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(within(screen.getByRole('table', { name: 'People with missing or invalid IDs' })).getAllByRole('row')).toHaveLength(4);
  });

  it('all clear, choose an entity, and no access', () => {
    const { unmount } = render(<MissingIdsScreen rows={[]} live={live({ data: { entityId: 'e1', people: 40, counts: { pan: 0, uan: 0, esi: 0, bank: 0 }, rows: [] } })} />);
    expect(screen.getByText('Every statutory ID is in place.')).toBeInTheDocument();
    expect(screen.getByText(/complete for all 40 people/)).toBeInTheDocument();
    unmount();
    const b = render(<MissingIdsScreen rows={[]} live={live({ entityId: null, data: null })} />);
    expect(screen.getByText('Choose a legal entity.')).toBeInTheDocument();
    b.unmount();
    render(<MissingIdsScreen rows={[]} live={live({ state: 'no-access', data: null })} />);
    expect(screen.getByText(/your compliance owner/)).toBeInTheDocument();
  });
});
