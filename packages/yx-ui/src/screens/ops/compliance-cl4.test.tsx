import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { VendorComplianceScreen } from './contract';
import type { VendorComplianceData, VendorComplianceLive } from './contract-live';
import { ContractorPortalScreen } from '../portals/t9-business';
import type { ContractorPackData, LiveContractorPortal } from '../portals/contractor-portal-live';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { clraSettingsChanges, clraSettingsPage, type ClraSettingsData } from '../settings/contract-labour-live';

// Contract labour CL-4 (CLB-03 vendor compliance, T9-13 packs and bills, Settings 4.9) with `live`: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const item = (state: 'submitted' | 'verified' | 'discrepancy', extra = {}) => ({ id: `i-${state}`, state, note: state === 'discrepancy' ? 'Covers 0 of 1.' : null, fileName: 'proof.pdf', scan: 'clean', workersCovered: 1, amount: '600.00', uploadedAt: '2026-10-05T10:00:00Z', version: 1, ...extra });
const DATA: VendorComplianceData = {
  month: '2026-10',
  due: '2026-11-15',
  holdMode: 'hold',
  canManage: true,
  proofTypes: [
    { kind: 'pf_challan', label: 'PF ECR and challan' },
    { kind: 'esi_challan', label: 'ESI challan' },
    { kind: 'wage_register', label: 'Wage register' },
    { kind: 'bank_proof', label: 'Wage payment proof' },
  ],
  months: ['2026-10', '2026-09'],
  rows: [
    {
      contractorId: 'c1',
      contractor: 'Vetri Security Agency',
      site: { id: 'hosur', name: 'Hosur plant' },
      month: '2026-10',
      due: '2026-11-15',
      status: 'discrepancy',
      released: null,
      deployed: 1,
      items: { pf_challan: item('discrepancy', { id: 'pf' }), esi_challan: item('submitted', { id: 'esi' }), wage_register: null, bank_proof: null, muster_roll: null },
      checks: [{ id: 'esi_challan', label: 'ESI challan: workers covered ≥ workers on site', status: 'pass', detail: 'Covers 1; 1 deployed in the month.' }],
      held: true,
      heldMonths: ['2026-10'],
    },
  ],
  alerts: [{ id: 'a1', type: 'Wage below minimum', contractor: 'Vetri Security Agency', contractorId: 'c1', site: 'Hosur plant', month: '2026-10', detail: 'Kannan S: paid ₹13,900 for 26 days; due ₹14,820.', liability: '920.00', severity: 'High', deploymentId: 'd1' }],
};
const live = (p: Partial<VendorComplianceLive> = {}): VendorComplianceLive => ({
  state: 'ready',
  data: DATA,
  onRetry: vi.fn(),
  onMonth: vi.fn(),
  onVerify: vi.fn(async () => undefined),
  onDiscrepancy: vi.fn(async () => undefined),
  onOpenFile: vi.fn(),
  onRelease: vi.fn(async () => undefined),
  onPayByUs: vi.fn(async () => undefined),
  ...p,
});
const vc = (l: VendorComplianceLive) => <VendorComplianceScreen month="" proofTypes={[]} matrix={[]} alerts={[]} live={l} />;

describe('CLB-03 vendor compliance (live)', () => {
  it('the matrix, the held bill and the liability; verify a submitted proof', async () => {
    const l = live();
    show(vc(l));
    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.getByText(/estimated exposure/)).toHaveTextContent('920');
    await ue.click(screen.getByRole('button', { name: /ESI challan, Vetri Security Agency: Submitted/ }));
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('ESI challan: workers covered ≥ workers on site')).toBeInTheDocument();
    await ue.click(within(d).getByRole('button', { name: 'Mark verified' }));
    expect(l.onVerify).toHaveBeenCalledWith('esi', 1);
  });

  it('a discrepancy needs a note', async () => {
    const l = live();
    show(vc(l));
    await ue.click(screen.getByRole('button', { name: /ESI challan, Vetri Security Agency: Submitted/ }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Raise discrepancy' }));
    await ue.click(within(d).getByRole('button', { name: 'Raise discrepancy' }));
    expect(within(d).getByText('Say what is wrong, so the contractor can fix it.')).toBeInTheDocument();
    expect(l.onDiscrepancy).not.toHaveBeenCalled();
  });

  it('release needs a reason; payment by us needs every field', async () => {
    const l = live();
    show(vc(l));
    await ue.click(screen.getByRole('button', { name: 'Release' }));
    let d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Release bill' }));
    expect(within(d).getByText('Say why the bill can be paid.')).toBeInTheDocument();
    await ue.type(within(d).getByLabelText(/Reason/), 'Paid in cash; register seen.');
    await ue.click(within(d).getByRole('button', { name: 'Release bill' }));
    expect(l.onRelease).toHaveBeenCalledWith('c1', '2026-10', 'Paid in cash; register seen.');
    await ue.click(screen.getByRole('button', { name: 'Record payment by us' }));
    d = screen.getByRole('dialog', { name: 'Record payment by us' });
    await ue.click(within(d).getByRole('button', { name: 'Record payment' }));
    expect(within(d).getByText('Choose the day it was paid.')).toBeInTheDocument();
    expect(within(d).getByText('Enter the payment reference.')).toBeInTheDocument();
    expect(l.onPayByUs).not.toHaveBeenCalled();
  });

  it('finance (no manage key) sees the hold but cannot release or record; alert-only says bills are not held', () => {
    const { unmount } = show(vc(live({ data: { ...DATA, canManage: false } })));
    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment by us' })).not.toBeInTheDocument();
    unmount();
    show(vc(live({ data: { ...DATA, holdMode: 'alert', rows: [{ ...DATA.rows[0]!, held: false }] } })));
    expect(screen.getByText('Bills are not held')).toBeInTheDocument();
  });
});

const PACK: ContractorPackData = {
  site: { id: 'hosur', name: 'Hosur plant' },
  month: '2026-10',
  due: '2026-11-15',
  status: 'open',
  items: { pf_challan: null, esi_challan: null, wage_register: null, bank_proof: null, muster_roll: null },
  workers: [{ deploymentId: 'd1', name: 'Kannan S', idMasked: 'XXXX XXXX 1234', skill: 'Unskilled', line: null, minimum: { monthly: '14820.00', daily: '570.00', source: 'TN 2026-04, zone A', verify: true }, short: null }],
  checks: [{ id: 'pf_challan', label: 'PF ECR and challan: workers covered ≥ workers on site', status: 'pending', detail: 'Not uploaded yet.' }],
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
  data: { company: 'Kaveri Foods', contractor: { name: 'Vetri', work: 'Security' }, contact: { name: 'Meera', email: 'm@v.in' }, today: '2026-11-10', sites: [], establishments: [], workOrders: [], workers: [], due: [] },
  onCheck: vi.fn(),
  onAdd: vi.fn(),
  onRenew: vi.fn(),
  packs: [{ month: '2026-10', site: { id: 'hosur', name: 'Hosur plant' }, due: '2026-11-15', status: 'open' }],
  pack: null,
  bills: { held: [], bills: [] },
  onOpenPack: vi.fn(),
  onUpload: vi.fn(async () => undefined),
  ...p,
});

describe('T9-13 monthly packs and bills (live, CL-4)', () => {
  it('the packs owed open one month', async () => {
    const l = plive();
    show(<ContractorPortalScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Open' }));
    expect(l.onOpenPack).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-10' }));
  });

  it('a challan needs the workers covered, the amount and the copy; the wage register every worker', async () => {
    const l = plive({ pack: PACK });
    show(<ContractorPortalScreen live={l} />);
    await ue.click(screen.getAllByRole('button', { name: 'Upload' })[0]!);
    await ue.click(screen.getAllByRole('button', { name: 'Upload' }).at(-1)!);
    for (const t of ['Enter how many workers the challan covers.', 'Enter the challan amount.', 'Attach the proof.']) expect(screen.getByText(t)).toBeInTheDocument();
    expect(l.onUpload).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getAllByRole('button', { name: 'Upload' })[2]!);
    expect(screen.getByText(/Minimum ₹14820\.00 a month/)).toBeInTheDocument();
    await ue.click(screen.getAllByRole('button', { name: 'Upload' }).at(-1)!);
    expect(screen.getByText(/Enter every worker’s days/)).toBeInTheDocument();
    expect(l.onUpload).not.toHaveBeenCalled();
  });

  it('bills: the hold banner and the wages we paid taken back', () => {
    show(<ContractorPortalScreen live={plive({ tab: 'bills', bills: { held: ['2026-10'], bills: [{ id: 'b1', no: 'VS-1', period: '2026-10', amount: '10000.00', tds: '200.00', recovery: '920.00', net: '8880.00', status: 'On hold', paidOn: null }] } })} />);
    expect(screen.getByText('Your bills are on hold')).toBeInTheDocument();
    expect(screen.getByText(/wages we paid your workers/)).toBeInTheDocument();
  });
});

describe('Settings 4.9 proofs and hold (live, CL-4)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.9')!;
  const data: ClraSettingsData = { canEdit: true, values: { 'clra.licence_alerts': '60,30,7', 'clra.doc_cutoff': '15', 'clra.payment_hold': 'hold' }, defaults: { 'clra.licence_alerts': '60,30,7', 'clra.doc_cutoff': '15', 'clra.payment_hold': 'hold' }, choices: { 'clra.licence_alerts': ['90', '60', '30', '15', '7'] }, lastChange: null, law: [] };
  it('shows the due day and the hold, and saves them as company settings', () => {
    const all = clraSettingsPage(design, data).sections.flatMap((s) => s.settings);
    expect(all.find((x) => x.key === 'clra.doc_cutoff')!.value).toBe(15);
    expect(all.find((x) => x.key === 'clra.payment_hold')!.optionLabels).toMatchObject({ alert: 'Alert only' });
    expect(all.some((x) => x.key === 'clra.checklist')).toBe(false);
    expect(clraSettingsChanges({ 'clra.doc_cutoff': 10, 'clra.payment_hold': 'alert' })).toEqual([{ key: 'clra.doc_cutoff', value: '10' }, { key: 'clra.payment_hold', value: 'alert' }]);
  });
});
