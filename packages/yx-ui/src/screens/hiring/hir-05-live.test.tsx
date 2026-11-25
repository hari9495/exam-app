import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { CandidateRecordScreen, type LiveCandidateRecord } from './hiring-pipeline';
import { CandidateListScreen, CandidateRetentionScreen, type LiveCandidateList, type LiveRetention } from './hiring-candidates';
import { samplePairs, sampleRows } from './hir-05-candidate-list.stories';
import { sampleFound, sampleRuns } from './hir-05-retention.stories';
import type { CandidateProfileView } from './live/types';

// HIR-05 candidate record, merge, candidate list and retention: the designed screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const PROFILE: CandidateProfileView = {
  candidate: { id: 'c1', name: 'Priya Raman', email: 'priya@example.com', phone: '+91 98450 12345', phoneE164: '+919845012345', status: 'active', globalStage: 'engaged', createdAt: '2026-09-01T00:00:00.000Z', erasedAt: null, emailOptedOut: false },
  legalHold: null,
  retention: { months: 12, lastActivityAt: '2026-10-01T00:00:00.000Z', until: '2027-10-01T00:00:00.000Z', noticeAt: null },
  exEmployee: null,
  resume: { hasFile: true, scan: 'clean', parseStatus: 'done', title: 'Senior Accountant', summary: 'Eight years in audit.', skills: 'Tally, GST', years: 8 },
  applications: [{ id: 'a1', jobId: 'j1', jobTitle: 'Senior Accountant', jobStatus: 'open', stage: 'Interview', status: 'Scheduled', appliedAt: '2026-09-01T00:00:00.000Z', closed: false, closedReason: null, source: 'careers' }],
  assessments: [{ id: 'i1', exam: 'Accounts aptitude', status: 'completed', invitedAt: '2026-09-03T00:00:00.000Z' }],
  interviews: [{ id: 'v1', status: 'confirmed', createdAt: '2026-09-10T00:00:00.000Z' }],
  messages: { emails: [], sms: 0, whatsapp: 0 },
  consents: [{ id: 'k2', purpose: 'talent_pool', version: 1, source: 'apply', givenAt: '2026-09-01T00:00:00.000Z', withdrawnAt: null }],
  lists: [],
  merges: [],
};

const record = (over: Partial<LiveCandidateRecord> = {}): LiveCandidateRecord => ({
  state: 'ready',
  onRetry: vi.fn(),
  profile: PROFILE,
  can: { manage: true, dataRights: true, resume: true },
  now: new Date('2026-11-09T06:00:00Z'),
  duplicates: [],
  pools: [{ value: 'l1', label: 'Finance talent' }],
  templates: [],
  senders: [],
  mergeOptions: [{ value: 'c9', label: 'Priya R · priya.r@example.com' }],
  onMergeSearch: vi.fn(),
  loadOther: vi.fn().mockResolvedValue({ name: 'Priya R', email: 'priya.r@example.com', phone: '98450 12345', hasResume: false }),
  onBack: vi.fn(),
  onOpenJob: vi.fn(),
  onResume: vi.fn().mockResolvedValue(undefined),
  onEmail: vi.fn().mockResolvedValue(undefined),
  onAddToPool: vi.fn().mockResolvedValue({ added: 1, refused: [] }),
  onMerge: vi.fn().mockResolvedValue(undefined),
  onHold: vi.fn().mockResolvedValue(undefined),
  onWithdrawPool: vi.fn().mockResolvedValue(undefined),
  onExport: vi.fn().mockResolvedValue(undefined),
  onErase: vi.fn().mockResolvedValue(undefined),
  onClearRehire: vi.fn().mockResolvedValue(undefined),
  ...over,
});

const lastDialog = async () => (await screen.findAllByRole('dialog')).at(-1)!;
const toasted = async (t: string) => expect((await screen.findAllByText(t)).length).toBeGreaterThan(0);
const openMenu = async () => ue.click(screen.getByRole('button', { name: /more actions/i }));

describe('HIR-05 candidate record (live)', () => {
  it('recruiter: contact facts, applications, consent tab and the data-rights menu', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    expect(screen.getByText('priya@example.com')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Consent & retention/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Open in pipeline' }));
    expect(live.onOpenJob).toHaveBeenCalledWith('j1');
    await openMenu();
    for (const item of ['Add to pool or hotlist', 'Merge with another candidate', 'Export candidate data', 'Place legal hold', 'Erase candidate data']) expect(screen.getByRole('menuitem', { name: item })).toBeInTheDocument();
  });

  it('hiring manager (view only): no contact details, no consent tab, no menu, no email', () => {
    show(<CandidateRecordScreen live={record({ can: { manage: false, dataRights: false, resume: true }, profile: { ...PROFILE, candidate: { ...PROFILE.candidate, email: null, phone: null }, consents: [], retention: null } })} />);
    expect(screen.queryByText('priya@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Consent/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Senior Accountant').length).toBeGreaterThan(0);
  });

  it('recruiter without the data-rights key: no merge, export, hold or erase', async () => {
    show(<CandidateRecordScreen live={record({ can: { manage: true, dataRights: false, resume: true }, duplicates: [{ id: 'c9', name: 'Priya R', email: 'priya.r@example.com', phone: null, reasons: ['phone'] }] })} />);
    expect(screen.queryByRole('button', { name: 'Review merge' })).not.toBeInTheDocument();
    expect(screen.getByText(/Someone with the candidate data-rights key can merge them/)).toBeInTheDocument();
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Erase candidate data' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Merge with another candidate' })).not.toBeInTheDocument();
  });

  it('merge from the duplicate alert: pressed too early shows the field errors; then confirms and merges', async () => {
    const live = record({ duplicates: [{ id: 'c9', name: 'Priya R', email: 'priya.r@example.com', phone: '98450 12345', reasons: ['phone'] }] });
    show(<CandidateRecordScreen live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Review merge' }));
    const d = await screen.findByRole('dialog', { name: 'Merge candidates' });
    await within(d).findByText(/fields? left to choose/);
    const merge = within(d).getByRole('button', { name: 'Merge records' });
    expect(merge).toBeEnabled();
    await ue.click(merge);
    expect(await within(d).findByText('Choose which name to keep.')).toBeInTheDocument();
    expect(live.onMerge).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('radio', { name: 'Priya R' }));
    await ue.click(within(d).getByRole('radio', { name: '+91 98450 12345' }));
    await ue.click(within(d).getByRole('radio', { name: "Priya Raman's résumé" }));
    await ue.click(merge);
    const c = await lastDialog();
    expect(within(c).getByText(/audit log and cannot be undone/)).toBeInTheDocument();
    await ue.click(within(c).getByRole('button', { name: 'Merge records' }));
    await waitFor(() => expect(live.onMerge).toHaveBeenCalledWith('c9', { name: 'merged', phone: 'kept', resume: 'kept' }, true));
    await toasted('Candidates merged');
  });

  it('merge from the menu needs the duplicate chosen first', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    await openMenu();
    await ue.click(screen.getByRole('menuitem', { name: 'Merge with another candidate' }));
    const d = await screen.findByRole('dialog', { name: 'Merge candidates' });
    await ue.click(within(d).getByRole('button', { name: 'Merge records' }));
    expect(await within(d).findByText('Choose the duplicate to merge.')).toBeInTheDocument();
    expect(live.loadOther).not.toHaveBeenCalled();
  });

  it('legal hold asks for a reason; erase confirms and toasts', async () => {
    const live = record();
    show(<CandidateRecordScreen live={live} />);
    await openMenu();
    await ue.click(screen.getByRole('menuitem', { name: 'Place legal hold' }));
    let d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Place hold' }));
    expect(await within(d).findByText('Enter a reason of at least 3 characters.')).toBeInTheDocument();
    expect(live.onHold).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Reason/), 'Court case 12/2026');
    await ue.click(within(d).getByRole('button', { name: 'Place hold' }));
    await waitFor(() => expect(live.onHold).toHaveBeenCalledWith(true, 'Court case 12/2026'));
    await openMenu();
    await ue.click(screen.getByRole('menuitem', { name: 'Erase candidate data' }));
    d = await lastDialog();
    await ue.click(within(d).getByRole('button', { name: 'Erase personal data' }));
    await waitFor(() => expect(live.onErase).toHaveBeenCalled());
    await toasted('Personal data erased');
  });

  it('ex-employee: HR sees exit details and clears an ineligible flag only with a reason', async () => {
    const live = record({ profile: { ...PROFILE, exEmployee: { level: 'rehire', exitDate: '2024-03-31T00:00:00.000Z', exitType: 'Resignation', rehireEligible: false, rehireReason: null, exitCaseId: 'x1', version: 3 } } });
    show(<CandidateRecordScreen live={live} />);
    expect(screen.getByText('Ex-employee · rehire eligible: no')).toBeInTheDocument();
    expect(screen.getByText(/Left on 31 Mar 2024 \(Resignation\)/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Clear flag with reason' }));
    const d = await screen.findByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Clear flag' }));
    expect(await within(d).findByText(/Say why the flag is cleared/)).toBeInTheDocument();
    expect(live.onClearRehire).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Reason/), 'Left on good terms; PIP was in another team');
    await ue.click(within(d).getByRole('button', { name: 'Clear flag' }));
    await waitFor(() => expect(live.onClearRehire).toHaveBeenCalledWith('Left on good terms; PIP was in another team'));
  });

  it('ex-employee: flag only for a viewer without an exit key; no clear button for a recruiter', () => {
    show(<CandidateRecordScreen live={record({ company: 'Kaveri Foods', profile: { ...PROFILE, exEmployee: { level: 'flag', exitDate: null, exitType: null, rehireEligible: null, rehireReason: null, exitCaseId: null, version: null } } })} />);
    expect(screen.getByText('Ex-employee', { selector: '.yx-inline-alert *, [role="status"] *, [role="alert"] *, strong, p, div' })).toBeInTheDocument();
    expect(screen.queryByText(/Left on/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear flag with reason' })).not.toBeInTheDocument();
  });

  it('erased, not found and no access show the designed states', () => {
    const { unmount } = show(<CandidateRecordScreen live={record({ profile: { ...PROFILE, candidate: { ...PROFILE.candidate, erasedAt: '2026-11-01T00:00:00.000Z' } } })} />);
    expect(screen.getByText(/anonymised after the retention period/)).toBeInTheDocument();
    unmount();
    show(<CandidateRecordScreen live={record({ state: 'denied', profile: null })} />);
    expect(screen.getByText(/this candidate/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});

const list = (over: Partial<LiveCandidateList> = {}): LiveCandidateList => ({
  state: 'ready',
  onRetry: vi.fn(),
  total: sampleRows.length,
  page: 1,
  pageSize: 25,
  onPage: vi.fn(),
  search: '',
  onSearch: vi.fn(),
  status: 'active',
  onStatus: vi.fn(),
  stage: null,
  onStage: vi.fn(),
  tab: 'candidates',
  onTab: vi.fn(),
  onOpen: vi.fn(),
  onCreate: vi.fn().mockResolvedValue({}),
  onUpdate: vi.fn().mockResolvedValue({}),
  onDelete: vi.fn().mockResolvedValue({ deleted: 1, skipped: 0 }),
  onInvite: vi.fn().mockResolvedValue({ invited: 1, skipped: 0 }),
  onUploadInvite: vi.fn().mockResolvedValue({ invited: 0, skipped: 0, errors: [] }),
  onDownloadTemplate: vi.fn().mockResolvedValue(undefined),
  onEmail: vi.fn().mockResolvedValue({ total: 1 }),
  onAddToList: vi.fn().mockResolvedValue({ added: 1, refused: [] }),
  onReengage: vi.fn().mockResolvedValue({}),
  onMerge: vi.fn().mockResolvedValue({}),
  ...over,
});

describe('HIR-05 candidate list (live)', () => {
  it('lists candidates; Add candidate pressed too early shows the error, then adds and toasts', async () => {
    const live = list();
    show(<CandidateListScreen rows={sampleRows} duplicates={samplePairs} live={live} />);
    expect(screen.getByText('Ananya Iyer')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Add candidate' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Add candidate' }));
    expect(await within(d).findByText('Enter the name.')).toBeInTheDocument();
    expect(live.onCreate).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/^Name/), 'Divya S');
    await ue.type(within(d).getByLabelText(/^Email/), 'divya@example.com');
    await ue.click(within(d).getByRole('button', { name: 'Add candidate' }));
    await waitFor(() => expect(live.onCreate).toHaveBeenCalledWith({ name: 'Divya S', email: 'divya@example.com', phone: undefined, customFields: undefined }));
    await toasted('Divya S added');
  });

  it('search goes to the server', async () => {
    const live = list();
    show(<CandidateListScreen rows={sampleRows} duplicates={[]} live={live} />);
    await ue.type(screen.getByPlaceholderText('Search by name or email'), 'a');
    expect(live.onSearch).toHaveBeenCalledWith('a');
  });

  it('read-only (hiring manager): no add, no upload, no duplicates tab', () => {
    show(<CandidateListScreen rows={sampleRows} duplicates={samplePairs} canManage={false} canMerge={false} live={list()} />);
    expect(screen.queryByRole('button', { name: 'Add candidate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Possible duplicates/ })).not.toBeInTheDocument();
  });

  it('possible duplicates: merge a pair keeping the chosen record', async () => {
    const live = list({ tab: 'duplicates' });
    show(<CandidateListScreen rows={sampleRows} duplicates={samplePairs} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Compare and merge' }));
    const d = await screen.findByRole('dialog', { name: 'Merge candidates' });
    await ue.click(within(d).getByRole('radio', { name: 'ananya.work@postbox.in' }));
    for (const v of ['Ananya Iyer', '98450 11223', "Ananya S Iyer's résumé (if any)"]) await ue.click(within(d).getByRole('radio', { name: v }));
    await ue.click(within(d).getByRole('button', { name: 'Merge records' }));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Merge records' }));
    await waitFor(() => expect(live.onMerge).toHaveBeenCalledWith('c9', 'c1', { name: 'merged', phone: 'kept', resume: 'kept' }));
  });

  it('without the data-rights key a pair cannot be merged', () => {
    show(<CandidateListScreen rows={sampleRows} duplicates={samplePairs} canMerge={false} live={list({ tab: 'duplicates' })} />);
    expect(screen.queryByRole('button', { name: 'Compare and merge' })).not.toBeInTheDocument();
    expect(screen.getByText(/Merging needs the candidate data-rights key/)).toBeInTheDocument();
  });
});

const retention = (over: Partial<LiveRetention> = {}): LiveRetention => ({
  state: 'ready',
  onRetry: vi.fn(),
  onMonths: vi.fn().mockResolvedValue(undefined),
  onPreview: vi.fn().mockResolvedValue({ periodMonths: 12, renewalsSent: 1, anonymised: 0, skippedHold: 0, skippedOpen: 0, skippedHired: 0 }),
  onRun: vi.fn().mockResolvedValue({ periodMonths: 12, renewalsSent: 1, anonymised: 2, skippedHold: 0, skippedOpen: 0, skippedHired: 0 }),
  onFind: vi.fn().mockResolvedValue(sampleFound),
  onOpen: vi.fn(),
  onExport: vi.fn().mockResolvedValue(undefined),
  onErase: vi.fn().mockResolvedValue(undefined),
  ...over,
});
const base = { months: '12', monthsOptions: ['6', '12', '24'], runs: sampleRuns };

describe('HIR-05 candidate data retention (live)', () => {
  it('a data request with a bad email shows the error and asks nothing', async () => {
    const live = retention();
    show(<CandidateRetentionScreen {...base} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('Enter the email address the person gave.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Email the person applied with/), 'not-an-email');
    await ue.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(live.onFind).not.toHaveBeenCalled();
  });

  it('finds the person, exports, then erases after a confirm', async () => {
    const live = retention();
    show(<CandidateRetentionScreen {...base} live={live} />);
    await ue.type(screen.getByLabelText(/^Email the person applied with/), 'fatima.s@mailbox.in');
    await ue.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('Fatima Shaikh')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Export their data' }));
    await waitFor(() => expect(live.onExport).toHaveBeenCalledWith('c3'));
    await ue.click(screen.getByRole('button', { name: 'Erase their data' }));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Erase personal data' }));
    await waitFor(() => expect(live.onErase).toHaveBeenCalledWith('c3'));
    expect(await screen.findByText('Erased', { selector: '.yx-badge, span' })).toBeInTheDocument();
  });

  it('on legal hold: no erase button', () => {
    show(<CandidateRetentionScreen {...base} found={{ ...sampleFound, onHold: true }} live={retention()} />);
    expect(screen.queryByRole('button', { name: 'Erase their data' })).not.toBeInTheDocument();
    expect(screen.getByText(/nothing is erased until the hold is lifted/)).toBeInTheDocument();
  });

  it('preview changes nothing; a real run needs the confirm', async () => {
    const live = retention();
    show(<CandidateRetentionScreen {...base} live={live} />);
    await ue.click(screen.getByRole('button', { name: 'Preview (changes nothing)' }));
    expect(await screen.findByText(/1 renewal emails, 0 anonymised/)).toBeInTheDocument();
    expect(live.onRun).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Run now' }));
    await ue.click(within(await lastDialog()).getByRole('button', { name: 'Run now' }));
    await waitFor(() => expect(live.onRun).toHaveBeenCalled());
  });

  it('no settings key: the period is shown, not a control', () => {
    show(<CandidateRetentionScreen {...base} canChange={false} live={retention()} />);
    expect(screen.queryByRole('combobox', { name: 'Keep details for' })).not.toBeInTheDocument();
    expect(screen.getByText(/12 months after the last activity/)).toBeInTheDocument();
  });
});
