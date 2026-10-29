import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsultantTdsScreen, Form16BulkScreen, RegistersScreen, RulesBrowserScreen, StatutoryHubScreen } from './compliance';
import { hubItem, monthChoices, taxYearOf, type LiveConsultantTds, type LiveForm16, type LiveRegisters, type LiveRules, type LiveStatutoryHub } from './compliance-live';
import { CONSULTANT_RETURNS } from './compliance-data';
import { FILINGS, HUB, PEOPLE, RETURNS } from '../pay/live/fixtures-5j';
import { ADVISORIES, CERTIFICATES, ENTITIES, REGISTERS } from '../pay/live/fixtures-ops';
import { RULE_SETS } from '../pay/live/fixtures-5ab';

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
  ...o,
});

describe('CMP-03 registers (live)', () => {
  it('freezing asks first; a signed register only downloads', async () => {
    const onFreeze = ok();
    render(<RegistersScreen rows={[]} live={regs({ onFreeze })} />);
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
    await waitFor(() => expect(onReview).toHaveBeenCalledWith(ADVISORIES[0], 'Raised two salaries in Mysuru'));
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
    expect(await screen.findByText('1 issued')).toBeInTheDocument();
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

  it('the Q4 link shows the filed return', () => {
    render(<Form16BulkScreen rows={[]} live={f16({ q4Return: { ...RETURNS[0], quarter: 4, taxYear: '2025-26', status: 'filed', tokenNo: 'TKN4' } })} />);
    expect(screen.getByText(/Linked: Form 138 Q4 2025-26, filed, token TKN4/)).toBeInTheDocument();
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
