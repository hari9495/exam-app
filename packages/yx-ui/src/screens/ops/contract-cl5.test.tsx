import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { AttendanceMonthScreen, RegistrationSheet, VendorComplianceScreen, WorkersScreen, type AttendanceRow } from './contract';
import type { VendorComplianceData, WorkersData, WorkersLive } from './contract-live';
import { ContractorPortalScreen } from '../portals/t9-business';
import type { ContractorPackData, LiveContractorPortal } from '../portals/contractor-portal-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { clraSettingsChanges, clraSettingsPage, type ClraSettingsData } from '../settings/contract-labour-live';

// Contract labour CL-5 with `live` (answers 625, 673, 684, 735, 741): positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const WDATA: WorkersData = {
  canManage: true,
  today: '2026-09-29',
  inductionRequired: true,
  inductionMonths: 12,
  contractors: [{ id: 'c1', name: 'Vetri Security Agency' }],
  locations: [{ id: 'hosur', name: 'Hosur plant', state: 'IN-TN' }],
  workers: [{ id: 'd1', personId: 'p1', name: 'Kannan S', contractor: { id: 'c1', name: 'Vetri Security Agency' }, site: { id: 'hosur', name: 'Hosur plant' }, skill: 'Unskilled', wage: '14820.00', fromOn: '2026-09-01', toOn: null, status: 'deployed', gatePass: 'GP-HSR-0001', gateValidTo: '2026-10-15', induction: { on: '2026-09-01', by: 'Safety officer' }, uan: null, esicIp: null, idMasked: 'XXXX XXXX 0123', releasedOn: null, releaseReason: null, photo: false, kioskPin: false, version: 2 }],
};
const wlive = (p: Partial<WorkersLive> = {}): WorkersLive => ({ state: 'ready', data: WDATA, onRetry: vi.fn(), onCheck: vi.fn(async () => []), onSend: vi.fn(async () => undefined), onApprove: vi.fn(async () => undefined), onRelease: vi.fn(async () => undefined), onRenewPass: vi.fn(async () => undefined), onPhoto: vi.fn(async () => undefined), photoUrl: vi.fn(async () => null), onKioskPin: vi.fn(async () => '7341'), ...p });
const workers = (l: WorkersLive) => <WorkersScreen workers={[]} contractors={[]} today={new Date('2026-09-29T00:00:00')} live={l} />;

describe('CLB-02 gate pass card, renewal and kiosk PIN (live, CL-5)', () => {
  it('the card names the end soon; a new kiosk PIN is shown once', async () => {
    const l = wlive();
    show(workers(l));
    await ue.click(screen.getAllByRole('button', { name: 'Gate pass' }).at(-1)!);
    const card = screen.getByRole('dialog');
    expect(within(card).getByLabelText('Gate pass GP-HSR-0001')).toBeInTheDocument();
    expect(within(card).getByText(/The gate pass ends in \d+ days/)).toBeInTheDocument();
    await ue.click(within(card).getByRole('button', { name: 'Kiosk PIN' }));
    expect(l.onKioskPin).toHaveBeenCalledWith('d1');
    expect(screen.getByLabelText('Kiosk PIN')).toHaveTextContent('7341');
  });

  it('renew keeps the number: sends the version; a reader sees no PIN, renew or photo', async () => {
    const l = wlive();
    const { unmount } = show(workers(l));
    await ue.click(screen.getAllByRole('button', { name: 'Gate pass' }).at(-1)!);
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Renew gate pass' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText(/GP-HSR-0001 keeps its number/)).toBeInTheDocument();
    const by = within(dlg).getByLabelText(/given by|Given by|by/i, { selector: 'input' });
    await ue.clear(by);
    await ue.click(within(dlg).getByRole('button', { name: 'Renew gate pass' }));
    expect(within(dlg).getByText('Enter who gave the induction.')).toBeInTheDocument();
    expect(l.onRenewPass).not.toHaveBeenCalled();
    await ue.type(by, 'Safety officer');
    await ue.click(within(dlg).getByRole('button', { name: 'Renew gate pass' }));
    expect(l.onRenewPass).toHaveBeenCalledWith('d1', 2, { on: '2026-09-01', by: 'Safety officer' });
    const withKey = screen.getAllByRole('button', { name: 'Gate pass' }).length;
    unmount();
    show(workers(wlive({ data: { ...WDATA, canManage: false } })));
    // The view key: no row actions (no card, PIN, renewal or photo).
    expect(screen.queryAllByRole('button', { name: 'Gate pass' })).toHaveLength(withKey - 1);
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
  });
});

const ROWS: AttendanceRow[] = [
  { contractorId: 'c1', contractor: 'Vetri Security Agency', site: { id: 'hosur', name: 'Hosur plant' }, contractorEnters: false, confirmed: null, workers: [{ deploymentId: 'd1', name: 'Kannan S', gatePass: 'GP-HSR-0001', present: 21, days: [] }] },
  { contractorId: 'c1', contractor: 'Vetri Security Agency', site: { id: 'maa', name: 'Chennai office' }, contractorEnters: true, confirmed: { at: '2026-10-02T10:00:00Z', days: 20 }, workers: [{ deploymentId: 'd2', name: 'Selvi R', gatePass: null, present: 20, days: [] }] },
];

describe('Contract workers’ attendance (live, CL-5)', () => {
  it('confirms an open month; a confirmed one shows Confirmed', async () => {
    const onConfirm = vi.fn(async () => undefined);
    show(<AttendanceMonthScreen month="2026-09" rows={ROWS} canManage canConfirm onConfirm={onConfirm} />);
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    // Walk finding: the month reads as words, not 2026-09.
    expect(screen.getByText(/Days on site in Sept? 2026/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Confirm month' }));
    const dlg = screen.getByRole('dialog');
    expect(within(dlg).getByText(/21 days on site for 1 worker\./)).toBeInTheDocument();
    await ue.click(within(dlg).getByRole('button', { name: 'Confirm month' }));
    expect(onConfirm).toHaveBeenCalledWith('c1', 'hosur', '2026-09');
  });

  it('without the key: no confirm button; nothing deployed reads so', () => {
    const { unmount } = show(<AttendanceMonthScreen month="2026-09" rows={ROWS} canManage={false} canConfirm={false} />);
    expect(screen.queryByRole('button', { name: 'Confirm month' })).not.toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    unmount();
    show(<AttendanceMonthScreen month="2026-09" rows={[]} canManage canConfirm />);
    expect(screen.getByText('No contract workers were deployed this month.')).toBeInTheDocument();
  });
});

describe('Registrations sheet (Settings 4.9, CL-5, answer 673)', () => {
  const sites = [{ id: 'hosur', name: 'Hosur plant' }];
  it('names every missing field and sends nothing', async () => {
    const onSave = vi.fn(async () => undefined);
    show(<RegistrationSheet initial={null} sites={sites} onClose={vi.fn()} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add registration' }));
    for (const t of ['Choose the site.', 'Enter the registration number.', 'Enter the maximum contract workers it allows.']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a change with its version; removes', async () => {
    const onSave = vi.fn(async () => undefined);
    const onRemove = vi.fn(async () => undefined);
    show(<RegistrationSheet initial={{ id: 'r1', locationId: 'hosur', registrationNo: 'TN/REG/1', maxWorkers: 40, validTo: null, version: 3 }} sites={sites} onClose={vi.fn()} onSave={onSave} onRemove={onRemove} />);
    await ue.click(screen.getByRole('button', { name: 'Save registration' }));
    expect(onSave).toHaveBeenCalledWith({ locationId: 'hosur', registrationNo: 'TN/REG/1', maxWorkers: 40, validTo: null, version: 3 });
    await ue.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();
  });
});

const PACK: ContractorPackData = {
  site: { id: 'hosur', name: 'Hosur plant' },
  month: '2026-10',
  due: '2026-11-15',
  status: 'open',
  required: ['pf_challan', 'esi_challan'],
  items: { pf_challan: null, esi_challan: null, wage_register: null, bank_proof: null, muster_roll: null },
  workers: [],
  checks: [],
};
const plive = (p: Partial<LiveContractorPortal> = {}): LiveContractorPortal => ({
  tenant: 'kaveri',
  tab: 'packs',
  hrefFor: (t) => `?tab=${t}`,
  state: 'ready',
  onRetry: vi.fn(),
  ended: false,
  onSignInAgain: vi.fn(),
  onSignOut: vi.fn(),
  data: { company: 'Kaveri Foods', contractor: { name: 'Vetri', work: 'Security' }, contact: { name: 'Meera', email: 'm@v.in' }, today: '2026-10-10', sites: [{ id: 'maa', name: 'Chennai office' }], establishments: [], workOrders: [], workers: [], due: [] },
  onCheck: vi.fn(),
  onAdd: vi.fn(),
  onRenew: vi.fn(),
  packs: [],
  pack: PACK,
  bills: { held: [], bills: [] },
  onOpenPack: vi.fn(),
  onUpload: vi.fn(async () => undefined),
  ...p,
});

describe('T9-13 muster roll and attendance (live, CL-5)', () => {
  it('the upload form keeps acronyms (walk finding: it read "Upload pf ecr and challan")', async () => {
    show(<ContractorPortalScreen live={plive()} />);
    await ue.click(screen.getAllByRole('button', { name: 'Upload' })[0]!);
    expect(screen.getByText('Upload PF ECR and challan')).toBeInTheDocument();
  });

  it('741: the proofs the company does not require read Optional and can still be uploaded', () => {
    show(<ContractorPortalScreen live={plive()} />);
    expect(screen.getByText('Muster roll (the days each worker was on site)')).toBeInTheDocument();
    expect(screen.getAllByText('Optional')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Upload' })).toHaveLength(5);
  });

  it('625: the contractor marks days and saves; a kiosk site is read-only', async () => {
    const att = { month: '2026-10', site: 'maa', contractorEnters: true, editable: true, confirmed: null, workers: [{ deploymentId: 'd1', name: 'Kannan S', gatePass: 'GP-1', from: '2026-10-01', to: null, days: [{ day: '2026-10-01', source: 'contractor' }], present: 1 }] };
    const onSave = vi.fn(async () => undefined);
    const { unmount } = show(<ContractorPortalScreen live={plive({ tab: 'attendance', attendance: { siteId: 'maa', month: '2026-10', data: att }, onSaveAttendance: onSave })} />);
    await ue.click(screen.getByRole('checkbox', { name: '2' }));
    await ue.click(screen.getByRole('button', { name: 'Save days' }));
    expect(onSave).toHaveBeenCalledWith([{ deploymentId: 'd1', days: ['2026-10-01', '2026-10-02'] }]);
    unmount();
    show(<ContractorPortalScreen live={plive({ tab: 'attendance', attendance: { siteId: 'maa', month: '2026-10', data: { ...att, contractorEnters: false, editable: false } } })} />);
    expect(screen.queryByRole('button', { name: 'Save days' })).not.toBeInTheDocument();
    expect(screen.getByText('From the kiosk')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('Required proofs on the tracker and 4.9 (live, CL-5, answer 741)', () => {
  it('the tracker shows only the required proofs as columns', () => {
    const data: VendorComplianceData = { month: '2026-10', due: '2026-11-15', holdMode: 'hold', canManage: true, proofTypes: [{ kind: 'pf_challan', label: 'PF ECR and challan', required: true }, { kind: 'muster_roll', label: 'Muster roll', required: false }], months: ['2026-10'], rows: [], alerts: [] };
    show(<VendorComplianceScreen month="" proofTypes={[]} matrix={[]} alerts={[]} live={{ state: 'ready', data, onRetry: vi.fn(), onMonth: vi.fn(), onVerify: vi.fn(), onDiscrepancy: vi.fn(), onRelease: vi.fn(), onPayByUs: vi.fn(), onOpenFile: vi.fn() }} />);
    expect(screen.queryByText('Muster roll')).not.toBeInTheDocument();
  });

  it('4.9: the required proofs, the warning share and the attendance source; saved in order', () => {
    const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.9')!;
    const values = { 'clra.required_proofs': 'pf_challan,muster_roll', 'clra.threshold_warn': '80', 'clra.attendance_source': 'contractor' };
    const data: ClraSettingsData = { canEdit: true, values, defaults: { ...values, 'clra.required_proofs': 'pf_challan,esi_challan,wage_register,bank_proof,muster_roll' }, choices: { 'clra.required_proofs': ['pf_challan', 'esi_challan', 'wage_register', 'bank_proof', 'muster_roll'] }, lastChange: null, law: [] };
    const all = clraSettingsPage(design, data).sections.flatMap((s) => s.settings);
    const req = all.find((x) => x.key === 'clra.required_proofs')!;
    expect(req.value).toEqual(['pf_challan', 'muster_roll']);
    expect(req.optionLabels).toMatchObject({ muster_roll: 'Muster roll' });
    expect(req.starter).toBe(false);
    expect(all.find((x) => x.key === 'clra.attendance_source')!.value).toBe('contractor');
    expect(clraSettingsChanges({ 'clra.required_proofs': ['muster_roll', 'pf_challan', 'nope'] })).toEqual([{ key: 'clra.required_proofs', value: 'pf_challan,muster_roll' }]);
  });
});

describe('Contractor portal shell (walk findings)', () => {
  it('a tab changes without reloading the page; a modified click keeps the link', async () => {
    const onTab = vi.fn();
    show(<ContractorPortalScreen live={plive({ tab: 'bills', onTab })} />);
    await ue.click(screen.getByRole('link', { name: 'Workers' }));
    expect(onTab).toHaveBeenCalledWith('workers');
    onTab.mockClear();
    await ue.keyboard('{Control>}');
    await ue.click(screen.getByRole('link', { name: 'Attendance' }));
    await ue.keyboard('{/Control}');
    expect(onTab).not.toHaveBeenCalled();
  });

  it('access ends with the contract, never today; without a licence or work order no end is shown', () => {
    const est = { licenceId: 'l1', site: { id: 'blr', name: 'Bengaluru head office' }, licenceNo: 'KA/1', scope: 'Security', states: ['IN-KA'], maxWorkers: 5, deployed: 1, validFrom: '2026-01-01', validTo: '2027-12-31', state: 'valid', renewal: null };
    const base = plive({ tab: 'bills' });
    const { unmount } = show(<ContractorPortalScreen live={{ ...base, data: { ...base.data!, establishments: [est] } }} />);
    expect(screen.getByText(/Access ends 31 Dec 2027/)).toBeInTheDocument();
    expect(screen.queryByText('Ends today')).not.toBeInTheDocument();
    unmount();
    show(<ContractorPortalScreen live={plive({ tab: 'bills' })} />);
    expect(screen.queryByText(/Access ends/)).not.toBeInTheDocument();
  });
});
