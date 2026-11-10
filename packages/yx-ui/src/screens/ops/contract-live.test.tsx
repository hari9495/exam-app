import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { ContractorsScreen } from './contract';
import type { ContractorsData, ContractorsLive } from './contract-live';
import { SettingsPageScreen } from '../settings/settings-screens';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { clraSettingsChanges, clraSettingsPage, thresholdText, type ClraSettingsData } from '../settings/contract-labour-live';

// Contract labour CL-1 (CLB-01 Contractors register, Settings 4.9) with `live`: positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const LIC = { id: 'l1', no: 'TN/CLRA/2024/0442', locationId: 'hosur', establishment: 'Hosur plant', scope: 'Security', states: ['IN-TN'], max: 20, validFrom: '2025-10-21', validTo: '2026-10-20', status: 'verified' as const, state: 'expiring' as const, renewalOfId: null, rejectReason: null, decided: { by: 'Lakshmi V', at: '2025-10-18T10:00:00Z' }, file: { name: 'vetri.pdf', scan: 'clean' as const }, block: null };
const DATA: ContractorsData = {
  canManage: true,
  today: '2026-09-29',
  alertDays: [60, 30, 7],
  locations: [{ id: 'hosur', name: 'Hosur plant', state: 'IN-TN' }],
  states: [{ code: 'IN-KA', name: 'Karnataka' }, { code: 'IN-TN', name: 'Tamil Nadu' }],
  contractors: [
    { id: 'c1', name: 'Vetri Security Agency', work: 'Security', contactEmail: 'ops@vetri.in', pan: 'AAHFV2210K', panVerified: false, gstin: null, pfCode: 'TNMAS0081230000', esicCode: null, lin: null, active: true, licences: [LIC] },
    { id: 'c2', name: 'Kaveri Loaders', work: 'Loading', contactEmail: null, pan: null, panVerified: false, gstin: null, pfCode: null, esicCode: null, lin: null, active: true, licences: [{ ...LIC, id: 'l2', no: 'TN/CLRA/2023/0198', validTo: '2026-08-15', state: 'expired', block: 'The contractor’s licence is not valid on this day.' }, { ...LIC, id: 'l3', no: 'TN/CLRA/2026/0900', validFrom: '2026-09-01', validTo: '2027-08-31', status: 'pending', state: 'pending', renewalOfId: 'l2', decided: null }] },
  ],
};
const live = (p: Partial<ContractorsLive> = {}): ContractorsLive => ({
  state: 'ready',
  data: DATA,
  onRetry: vi.fn(),
  onSaveContractor: vi.fn(async () => undefined),
  onAddLicence: vi.fn(async () => undefined),
  onRenew: vi.fn(async () => undefined),
  onVerify: vi.fn(async () => undefined),
  onReject: vi.fn(async () => undefined),
  onOpenFile: vi.fn(),
  ...p,
});
const screenOf = (l: ContractorsLive) => <ContractorsScreen contractors={[]} establishments={[]} today={new Date()} live={l} />;

describe('CLB-01 Contractors register (live)', () => {
  it('lists contractors with their licence state from the server; no sample cards, work order or contractor login', async () => {
    show(screenOf(live()));
    expect(screen.getByText('Vetri Security Agency')).toBeInTheDocument();
    expect(screen.getByText('Expires in 21 days')).toBeInTheDocument();
    expect(screen.getAllByText('Up to 20')).toHaveLength(2);
    expect(screen.queryByText(/Threshold \(OSH Code/)).not.toBeInTheDocument();
    await ue.click(screen.getByText('Vetri Security Agency'));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('60, 30 and 7 days before expiry')).toBeInTheDocument();
    expect(within(drawer).queryByText('Work order')).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Invite to contractor login' })).not.toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Licence copy' }));
  });

  it('an expired licence shows the deployment block; a renewal waits and is verified', async () => {
    const l = live();
    show(screenOf(l));
    await ue.click(screen.getByText('Kaveri Loaders'));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Deployment blocked')).toBeInTheDocument();
    expect(within(drawer).getByText('Renewal of licence TN/CLRA/2023/0198')).toBeInTheDocument();
    expect(within(drawer).getByText('Renewal waiting for verification')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Add renewal' })).not.toBeInTheDocument();
    await ue.click(within(drawer).getByRole('button', { name: 'Verify' }));
    expect(l.onVerify).toHaveBeenCalledWith('l3');
  });

  it('a reader without the manage key sees no Add, Verify or Reject', async () => {
    show(screenOf(live({ data: { ...DATA, canManage: false } })));
    expect(screen.queryByRole('button', { name: 'Add contractor' })).not.toBeInTheDocument();
    await ue.click(screen.getByText('Kaveri Loaders'));
    expect(screen.queryByRole('button', { name: 'Verify' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add licence' })).not.toBeInTheDocument();
  });

  it('add contractor: an empty or wrong form never saves and says why; a good one saves trimmed', async () => {
    const l = live();
    show(screenOf(l));
    await ue.click(screen.getAllByRole('button', { name: 'Add contractor' })[0]!);
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Add contractor' }));
    expect(within(sheet).getByText('Enter the contractor’s name.')).toBeInTheDocument();
    expect(l.onSaveContractor).not.toHaveBeenCalled();
    await ue.type(within(sheet).getByLabelText(/Contractor name/), '  Annapoorna Canteen ');
    await ue.type(within(sheet).getByLabelText(/Kind of work/), 'Canteen');
    await ue.type(within(sheet).getByLabelText(/ESIC code/), '123');
    await ue.click(within(sheet).getByRole('button', { name: 'Add contractor' }));
    expect(within(sheet).getByText('An ESIC code has 17 digits.')).toBeInTheDocument();
    expect(l.onSaveContractor).not.toHaveBeenCalled();
    await ue.clear(within(sheet).getByLabelText(/ESIC code/));
    await ue.type(within(sheet).getByLabelText(/ESIC code/), '51000123450001001');
    await ue.click(within(sheet).getByRole('button', { name: 'Add contractor' }));
    expect(l.onSaveContractor).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Annapoorna Canteen', work: 'Canteen', esicCode: '51000123450001001' }));
  });

  it('a server refusal stays in the sheet', async () => {
    const l = live({ onSaveContractor: vi.fn(async () => Promise.reject(new Error('Vetri Security Agency is already a contractor.'))) });
    show(screenOf(l));
    await ue.click(screen.getAllByRole('button', { name: 'Add contractor' })[0]!);
    const sheet = screen.getByRole('dialog');
    await ue.type(within(sheet).getByLabelText(/Contractor name/), 'Vetri Security Agency');
    await ue.type(within(sheet).getByLabelText(/Kind of work/), 'Security');
    await ue.click(within(sheet).getByRole('button', { name: 'Add contractor' }));
    expect(await within(sheet).findByText('Vetri Security Agency is already a contractor.')).toBeInTheDocument();
  });

  it('add licence: every missing field is named, the copy is required', async () => {
    const l = live();
    show(screenOf(l));
    await ue.click(screen.getByText('Vetri Security Agency'));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add licence' }));
    const sheet = screen.getByRole('dialog');
    await ue.click(within(sheet).getByRole('button', { name: 'Add licence' }));
    for (const t of ['Choose the establishment.', 'Enter the licence number.', 'Say what work the licence covers.', 'Enter the maximum number of workers.', 'Attach a copy of the licence.']) expect(within(sheet).getByText(t)).toBeInTheDocument();
    expect(l.onAddLicence).not.toHaveBeenCalled();
  });

  it('reject needs a reason', async () => {
    const l = live();
    show(screenOf(l));
    await ue.click(screen.getByText('Kaveri Loaders'));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject' }));
    const dlg = screen.getByRole('dialog', { name: /Reject licence/ });
    await ue.click(within(dlg).getByRole('button', { name: 'Reject licence' }));
    expect(within(dlg).getByText('Say why, so the contractor can fix it.')).toBeInTheDocument();
    expect(l.onReject).not.toHaveBeenCalled();
    await ue.type(within(dlg).getByLabelText(/Reason/), 'Copy is unreadable');
    await ue.click(within(dlg).getByRole('button', { name: 'Reject licence' }));
    expect(l.onReject).toHaveBeenCalledWith('l3', 'Copy is unreadable');
  });

  it('loading, empty and error states', () => {
    const { unmount } = show(screenOf(live({ state: 'loading', data: null })));
    unmount();
    const e = show(screenOf(live({ data: { ...DATA, contractors: [] } })));
    expect(screen.getByText('No contractors yet.')).toBeInTheDocument();
    e.unmount();
    show(screenOf(live({ state: 'error', data: null })));
    expect(screen.queryByText('Vetri Security Agency')).not.toBeInTheDocument();
  });
});

const LAW: ClraSettingsData['law'] = ['IN-KA', 'IN-TN'].flatMap((state) => [
  { state, version: 'clra-1970-v1', validFrom: '1971-02-10', validTo: '2025-11-20', verify: true, source: 'CLRA', values: { law: 'Contract Labour (Regulation and Abolition) Act, 1970', registrationThreshold: 20, licenceThreshold: 20, minAge: 18 } },
  { state, version: 'osh-2025-v1', validFrom: '2025-11-21', validTo: null, verify: true, source: 'OSH', values: { law: 'Occupational Safety, Health and Working Conditions Code, 2020', registrationThreshold: 50, licenceThreshold: 50, minAge: 18 } },
]);
const SETTINGS_DATA: ClraSettingsData = { canEdit: true, values: { 'clra.licence_alerts': '60,30,7' }, defaults: { 'clra.licence_alerts': '60,30,7' }, choices: { 'clra.licence_alerts': ['90', '60', '30', '15', '7'] }, lastChange: null, law: LAW };
const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '4.9')!;

describe('Settings 4.9 Contract labour (live)', () => {
  it('the threshold from the rule set, per state only when the states differ', () => {
    expect(thresholdText(LAW)).toBe('50 contract workers (20 for dates before 21 Nov 2025)');
    const ka = LAW.map((r) => (r.state === 'IN-KA' && !r.validTo ? { ...r, values: { ...r.values, registrationThreshold: 40 } } : r));
    expect(thresholdText(ka)).toMatch(/^Karnataka: 40 contract workers .*; Tamil Nadu: 50 contract workers/);
    expect(thresholdText([])).toBe('Not in the rules yet');
  });

  it('shows the law rows and the alert days; registrations and monthly compliance are left out', () => {
    const page = clraSettingsPage(design, SETTINGS_DATA);
    const keys = page.sections.flatMap((s) => s.settings.map((x) => x.key));
    expect(keys).toEqual(['clra.threshold', 'clra.licence_check', 'clra.licence_alerts', 'clra.min_age']);
    const alerts = page.sections.flatMap((s) => s.settings).find((x) => x.key === 'clra.licence_alerts')!;
    expect(alerts.value).toEqual(['60', '30', '7']);
    expect(alerts.starter).toBe(true);
    expect(page.sections.flatMap((s) => s.settings).find((x) => x.key === 'clra.threshold')!.law).toMatch(/\(verify\)$/);
    show(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="4.9" live={{ page, canEdit: true, lastChange: null, onSave: vi.fn() }} />);
    expect(screen.getByText('50 contract workers (20 for dates before 21 Nov 2025)')).toBeInTheDocument();
    expect(screen.queryByText('Principal-employer registrations')).not.toBeInTheDocument();
    expect(screen.queryByText('Vendor compliance checklist')).not.toBeInTheDocument();
  });

  it('an older API without the setting never shows a sample value; changes go largest first', () => {
    const page = clraSettingsPage(design, { ...SETTINGS_DATA, values: {} });
    expect(page.sections.flatMap((s) => s.settings.map((x) => x.key))).not.toContain('clra.licence_alerts');
    expect(clraSettingsChanges({ 'clra.licence_alerts': ['7', '90', '30'] })).toEqual([{ key: 'clra.licence_alerts', value: '90,30,7' }]);
    expect(clraSettingsChanges({ other: 'x' })).toEqual([]);
  });
});
