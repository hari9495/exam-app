import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BenchBoardScreen, PlacementRecordScreen, PlacementsScreen, SubmissionsBoardScreen, VendorsScreen, type LiveVendors, type PlacementRowView, type SubmissionRowView, type VendorSubmissionView } from './hiring-staffing';
import { PlacementSheet, ShareJobSheet, SubmitToClientSheet, VendorSheet } from './staffing-sheets';
import { SettingsPageScreen } from '../settings/settings-screens';
import { SETTINGS_GROUPS } from '../settings/settings-groups';
import { staffingSettingsChanges, staffingSettingsPage, type StaffingSettingsData } from '../settings/staffing-live';

// Staffing desk slice 2 (HIR-16, HIR-17, HIR-21, Settings 6.2): the designed screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const SUB: SubmissionRowView = { id: 's1', person: 'Arun Kumar', job: 'Java Developer', jobId: 'j1', client: 'Nilgiri Retail', contact: 'Meera', billRate: '1200.00', source: 'Bench', kind: 'employee', stage: 'client_review', daysInStage: 3, slaDays: 2, feedback: null, rejectedReason: null, emailed: true };
const PL: PlacementRowView = { id: 'p1', person: 'Arun Kumar', role: 'Java Developer', unit: 'hour', clientId: 'c1', client: 'Nilgiri Retail', supply: 'own', vendor: null, startOn: '2026-11-01', endOn: '2026-11-30', status: 'ending_soon', endedReason: null, billRate: '1200.00', costRate: '800.00', statutory: '80.00', margin: '320.00', marginPct: '26.7', version: 2 };

describe('HIR-16 submissions board (live)', () => {
  it('shows each card in its stage with source and bill rate; the desk off and empty states', () => {
    const base = { onRetry: vi.fn(), onSubmit: vi.fn(), onMove: vi.fn() };
    const { unmount } = wrap(<SubmissionsBoardScreen live={{ ...base, state: 'ready', rows: [SUB] }} />);
    expect(screen.getByText('Arun Kumar')).toBeInTheDocument();
    expect(screen.getByText(/Bill ₹1,200 · Bench/)).toBeInTheDocument();
    unmount();
    const r2 = wrap(<SubmissionsBoardScreen live={{ ...base, state: 'off', rows: [] }} />);
    expect(screen.getByText('The staffing desk is off.')).toBeInTheDocument();
    r2.unmount();
    wrap(<SubmissionsBoardScreen live={{ ...base, state: 'ready', rows: [] }} />);
    expect(screen.getByText('No submissions yet.')).toBeInTheDocument();
  });
  it('submit sheet: pressed too early shows each error; the chosen people go with the job, contact and rate', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const loadOptions = vi.fn().mockResolvedValue({ job: { id: 'j1', title: 'Java Developer', client: 'Nilgiri' }, billRate: '1200.00', unit: 'hour', mask: true, people: [{ kind: 'employee', id: 'e1', name: 'Arun Kumar', note: 'Bench since 2026-10-01' }], contacts: [{ id: 'k1', name: 'Meera', role: 'HR' }] });
    wrap(<SubmitToClientSheet open onOpenChange={vi.fn()} jobs={[{ value: 'j1', label: 'Java Developer · Nilgiri' }]} initialJobId="j1" loadOptions={loadOptions} onSave={onSave} />);
    await screen.findByText('Hide phone and email from the client until they shortlist');
    await ue.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByText('Choose at least one person.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await ue.click(screen.getByRole('combobox', { name: /People/ }));
    await ue.click(await screen.findByRole('option', { name: /Arun Kumar/ }));
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ jobId: 'j1', people: [{ kind: 'employee', id: 'e1' }], contactId: 'k1', billRate: 1200, masked: true }));
  });
});

describe('HIR-17 placements and bench (live)', () => {
  it('account manager: margin column; recruiter: none, and no New placement', async () => {
    const base = { state: 'ready' as const, onRetry: vi.fn(), onNew: vi.fn(), onOpen: vi.fn(), onBench: vi.fn() };
    const { unmount } = wrap(<PlacementsScreen live={{ ...base, rows: [PL], showPay: true, canManage: true }} />);
    expect(screen.getByRole('columnheader', { name: /Margin per unit/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New placement' })).toBeInTheDocument();
    unmount();
    const { costRate, statutory, margin, marginPct, ...plain } = PL;
    void [costRate, statutory, margin, marginPct];
    wrap(<PlacementsScreen live={{ ...base, rows: [plain], showPay: false, canManage: false }} />);
    expect(screen.queryByRole('columnheader', { name: /Margin/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New placement' })).not.toBeInTheDocument();
    expect(screen.queryByText(/₹320/)).not.toBeInTheDocument();
  });
  it('record: extending needs a day after the current last day', async () => {
    const onExtend = vi.fn().mockResolvedValue(undefined);
    wrap(<PlacementRecordScreen live={{ state: 'ready', onRetry: vi.fn(), placement: PL, showPay: true, canManage: true, today: new Date(2026, 10, 10), onExtend, onEnd: vi.fn() }} />);
    expect(screen.getByText(/Placement ends in 20 days/)).toBeInTheDocument();
    expect(screen.getByText(/₹320\/hour \(26.7%\)/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Extend' }));
    await ue.click(screen.getByRole('button', { name: 'Save extension' }));
    expect(screen.getByText('Choose a day after the current last day.')).toBeInTheDocument();
    expect(onExtend).not.toHaveBeenCalled();
  });
  it('record: ending early needs a reason before anything is sent', async () => {
    const onEnd = vi.fn().mockResolvedValue(undefined);
    wrap(<PlacementRecordScreen live={{ state: 'ready', onRetry: vi.fn(), placement: PL, showPay: true, canManage: true, today: new Date(2026, 10, 10), onExtend: vi.fn(), onEnd }} />);
    await ue.click(screen.getByRole('button', { name: 'End early' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'End placement' }));
    expect(within(dialog).getByText('Choose the reason.')).toBeInTheDocument();
    expect(onEnd).not.toHaveBeenCalled();
  });
  it('an ended placement has no change buttons', () => {
    wrap(<PlacementRecordScreen live={{ state: 'ready', onRetry: vi.fn(), placement: { ...PL, status: 'ended', endedReason: 'client' }, showPay: true, canManage: true, today: new Date(2026, 10, 10), onExtend: vi.fn(), onEnd: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Extend' })).not.toBeInTheDocument();
    expect(screen.getByText('Client ended the project')).toBeInTheDocument();
  });
  it('new placement sheet: a pipeline candidate is warned; the last day cannot be before the first', async () => {
    const onSave = vi.fn();
    wrap(<PlacementSheet open onOpenChange={vi.fn()} today={new Date(2026, 10, 10)} placeable={[{ id: 's2', person: 'Deepa', job: 'Java', source: 'candidate' }]} onSave={onSave} />);
    expect(screen.getByText(/joins as an employee first/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Start placement' }));
    expect(screen.getByText('Choose the last day.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Client site')).not.toBeInTheDocument();
  });
  it('new placement sheet (CL-8): our employee can be placed at a client site', async () => {
    const onSave = vi.fn(async () => undefined);
    wrap(<PlacementSheet open onOpenChange={vi.fn()} today={new Date(2026, 10, 10)} placeable={[{ id: 's1', person: 'Kiran', job: 'Guard', source: 'employee', sites: [{ id: 'cs1', name: 'Ambattur unit' }] }]} onSave={onSave} />);
    await ue.click(screen.getByRole('combobox', { name: /Client site/ }));
    await ue.click(await screen.findByRole('option', { name: 'Ambattur unit' }));
    await ue.type(screen.getByRole('textbox', { name: /Last day/ }), '30/11/2027{Enter}');
    await ue.click(screen.getByRole('button', { name: 'Start placement' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ submissionId: 's1', startOn: '2026-11-10', endOn: '2027-11-30', clientSiteId: 'cs1' }));
  });
  it('bench: days against the policy; over the limit says what to do; only managers take someone off', () => {
    const rows = [{ id: 'b1', employeeId: 'e1', person: 'Arun Kumar', sinceOn: '2026-09-01', days: 35, left: -5, overPolicy: true, lastClient: 'Nilgiri Retail', note: null }];
    const base = { state: 'ready' as const, onRetry: vi.fn(), rows, policy: { maxDays: 30, payPct: 50, after: 'review' as const }, onAdd: vi.fn(), onRemove: vi.fn(), onSubmit: vi.fn(), onPlacements: vi.fn() };
    const { unmount } = wrap(<BenchBoardScreen live={{ ...base, canManage: true }} />);
    expect(screen.getByText(/50% pay, up to 30 days, then redeploy or an exit review/)).toBeInTheDocument();
    expect(screen.getByText('Redeploy or start an exit review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take off the bench' })).toBeInTheDocument();
    unmount();
    wrap(<BenchBoardScreen live={{ ...base, canManage: false }} />);
    expect(screen.queryByRole('button', { name: 'Take off the bench' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to bench' })).not.toBeInTheDocument();
  });
});

describe('HIR-21 vendors (live)', () => {
  const vendor = { portalToken: 't1', jobs: [], id: 'v1', name: 'Velocity Talent', contactEmail: null, pan: 'ABCDE1234F', gstin: null, tdsSection: '194C' as const, tier: 'preferred' as const, agreementSignedOn: '2026-04-01', bankVerified: true, active: true, status: 'active' as const, missing: [], sharedJobs: 1, submissions: 2, duplicateRate: 50, placements: 1 };
  const over: VendorSubmissionView = { id: 'a1', vendor: 'Velocity Talent', candidate: 'Ravi', job: 'Java Developer', jobId: 'j1', clientJob: true, at: '2026-11-09T10:00:00Z', quoted: '950.00', cap: '900.00', overBy: '50.00', overCap: true, exception: null, duplicate: null, rightToRepresent: true, consent: true, status: 'pending' };
  const dup: VendorSubmissionView = { ...over, id: 'a2', vendor: 'Second Source', quoted: '800.00', overBy: null, overCap: false, duplicate: { holder: 'Velocity Talent', until: '2027-02-07' } };
  const live = (p: Partial<LiveVendors> = {}): LiveVendors => ({ state: 'ready', onRetry: vi.fn(), vendors: [vendor], submissions: [over, dup], canManage: true, canForward: true, defaultTab: 'submissions', onAdd: vi.fn(), onEdit: vi.fn(), onShare: vi.fn(), onException: vi.fn().mockResolvedValue(undefined), loadContacts: vi.fn().mockResolvedValue([{ value: 'k1', label: 'Meera' }]), onForward: vi.fn().mockResolvedValue(undefined), canReview: false, onAccept: vi.fn(), onReject: vi.fn(), ...p });
  it('over cap: an exception needs a reason; a duplicate names the holder and cannot be forwarded', async () => {
    const l = live();
    wrap(<VendorsScreen live={l} />);
    expect(screen.getByText(/over cap ₹900 by ₹50/)).toBeInTheDocument();
    expect(screen.getByText(/Duplicate: held by Velocity Talent until/)).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Forward to client' })).toHaveLength(0); // over cap and duplicate: neither ready
    await ue.click(screen.getByRole('button', { name: 'Approve exception with reason' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve exception' }));
    expect(within(dialog).getByText(/Say why/)).toBeInTheDocument();
    expect(l.onException).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByLabelText(/Reason/), 'Rare skill');
    await ue.click(within(dialog).getByRole('button', { name: 'Approve exception' }));
    await waitFor(() => expect(l.onException).toHaveBeenCalledWith('a1', 'Rare skill'));
  });
  it('with an approved exception the account manager forwards to a client contact; a recruiter sees no quotes', async () => {
    const l = live({ submissions: [{ ...over, overCap: false, exception: { reason: 'Rare', at: '2026-11-09' } }] });
    const { unmount } = wrap(<VendorsScreen live={l} />);
    await ue.click(screen.getByRole('button', { name: 'Forward to client' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(l.loadContacts).toHaveBeenCalledWith('j1'));
    await ue.click(within(dialog).getByRole('button', { name: 'Forward to client' }));
    await waitFor(() => expect(l.onForward).toHaveBeenCalledWith('a1', 'k1'));
    unmount();
    wrap(<VendorsScreen live={live({ canManage: false, canForward: false, submissions: [{ ...over, quoted: null, cap: null, overBy: null }] })} />);
    expect(screen.getByText('Quote over the rate cap')).toBeInTheDocument();
    expect(screen.queryByText(/₹950/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve exception with reason' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add vendor' })).not.toBeInTheDocument();
  });
  it('vendor sheet: a malformed PAN and a GSTIN without the PAN are caught before sending', async () => {
    const onSave = vi.fn();
    wrap(<VendorSheet open onOpenChange={vi.fn()} initial={null} onSave={onSave} />);
    await ue.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(screen.getByText('Enter the vendor’s name.')).toBeInTheDocument();
    await ue.type(screen.getByLabelText(/^Vendor name/), 'Velocity');
    await ue.type(screen.getByLabelText(/^PAN/), 'ABC');
    await ue.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(screen.getByText(/A PAN has 10 characters/)).toBeInTheDocument();
    await ue.clear(screen.getByLabelText(/^PAN/));
    await ue.type(screen.getByLabelText(/^PAN/), 'ABCDE1234F');
    await ue.type(screen.getByLabelText(/^GSTIN/), '29ZZZZZ9999Z1Z5');
    await ue.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(screen.getByText('The GSTIN does not carry this PAN.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
  it('share sheet: the cap is suggested from the target margin and cannot exceed the bill rate', async () => {
    const onSave = vi.fn();
    wrap(<ShareJobSheet open onOpenChange={vi.fn()} today={new Date(2026, 10, 10)} jobs={[{ value: 'j1', label: 'Java Developer · Nilgiri' }]} vendors={[{ value: 'v1', label: 'Velocity', complete: true }]} loadOptions={async () => ({ job: { id: 'j1', title: 'Java Developer', status: 'open' }, client: 'Nilgiri', billRate: '1200.00', unit: 'hour', targetMarginPct: 25, suggestedCap: '900.00', sharedWith: [] })} onSave={onSave} />);
    await ue.click(screen.getByRole('combobox', { name: /^Job/ }));
    await ue.click(await screen.findByRole('option', { name: /Java Developer/ }));
    expect(await screen.findByText(/less the 25% target margin/)).toBeInTheDocument();
    expect(screen.getByText(/Rate cap ₹900/)).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Share' }));
    expect(screen.getByText('Choose at least one vendor.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('Settings 6.2 slice 2 (live)', () => {
  const design = SETTINGS_GROUPS.flatMap((g) => g.pages).find((p) => p.id === '6.2')!;
  const values = { 'staffing.desk.enabled': 'on', 'staffing.ot_multiplier': '1.5', 'staffing.holiday_multiplier': '2', 'staffing.payment_terms_days': '30', 'staffing.rate_change.backdate_days': '0', 'staffing.vendor.target_margin_pct': '25', 'staffing.vendor.ownership_days': '90', 'staffing.submission.mask_contact': 'on', 'staffing.placement.ending_soon_days': '30', 'staffing.statutory_cost_pct': '0', 'staffing.bench.pay_pct': '50', 'staffing.bench.max_days': '30', 'staffing.bench.after': 'review' };
  const DATA: StaffingSettingsData = { canEdit: true, values, defaults: values, choices: { 'staffing.bench.pay_pct': ['0', '50', '100'], 'staffing.bench.max_days': ['30', '60'], 'staffing.vendor.target_margin_pct': ['25', '30'], 'staffing.vendor.ownership_days': ['90'], 'staffing.placement.ending_soon_days': ['30'], 'staffing.statutory_cost_pct': ['0', '10'] }, lastChange: null, financialYear: '2026-27', entities: [], series: [] };
  it('shows the bench, vendor and placement policies with the company values; the bench choice is a segment', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    wrap(<SettingsPageScreen groups={SETTINGS_GROUPS} pageId="6.2" live={{ page: staffingSettingsPage(design, DATA), canEdit: true, lastChange: null, onSave }} />);
    for (const t of ['Bench pay', 'Maximum bench days', 'Target margin for a vendor rate cap', 'A vendor holds a candidate it submitted for', 'Statutory cost on own-payroll pay']) expect(screen.getByText(t)).toBeInTheDocument();
    for (const t of ['Client portal response times', 'Payment reminders']) expect(screen.queryByText(t)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('radio', { name: 'Unpaid bench' }));
    await ue.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(staffingSettingsChanges(onSave.mock.calls[0]![0])).toEqual([{ key: 'staffing.bench.after', value: 'unpaid' }]);
  });
  it('maps the slice-2 fields back to their company settings', () => {
    expect(staffingSettingsChanges({ 'staff.mask_contact': false, 'staff.vendor_ownership': '60', 'staff.bench_pay': '75', 'staff.statutory_cost': '13' })).toEqual([
      { key: 'staffing.submission.mask_contact', value: 'off' },
      { key: 'staffing.vendor.ownership_days', value: '60' },
      { key: 'staffing.bench.pay_pct', value: '75' },
      { key: 'staffing.statutory_cost_pct', value: '13' },
    ]);
  });
});

describe('answer 489: Review dispute (live)', () => {
  it('an account manager overrides a duplicate only with a reason; then it reads as overridden', async () => {
    const onOverride = vi.fn().mockResolvedValue(undefined);
    const dup = { id: 'a2', vendor: 'Second', candidate: 'Ravi', job: 'Java', jobId: 'j1', clientJob: true, at: '2026-11-09T10:00:00Z', quoted: '800.00', cap: '900.00', overBy: null, overCap: false, exception: null, duplicate: { holder: 'Velocity', until: '2027-02-07' }, rightToRepresent: true, consent: true, status: 'pending' as const };
    const base = { state: 'ready' as const, onRetry: vi.fn(), vendors: [], showRegister: false, defaultTab: 'submissions' as const, canManage: true, canForward: true, canReview: false, onAdd: vi.fn(), onEdit: vi.fn(), onShare: vi.fn(), onException: vi.fn(), loadContacts: vi.fn().mockResolvedValue([]), onForward: vi.fn(), onAccept: vi.fn(), onReject: vi.fn() };
    const { unmount } = wrap(<VendorsScreen live={{ ...base, submissions: [dup], onOverride }} />);
    expect(screen.queryByRole('button', { name: 'Forward to client' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Review dispute' }));
    const dialog = await screen.findByRole('dialog');
    await ue.click(within(dialog).getByRole('button', { name: 'Override with reason' }));
    expect(within(dialog).getByText(/Say why/)).toBeInTheDocument();
    expect(onOverride).not.toHaveBeenCalled();
    await ue.type(within(dialog).getByLabelText(/Reason/), 'Withdrawn by Velocity');
    await ue.click(within(dialog).getByRole('button', { name: 'Override with reason' }));
    await waitFor(() => expect(onOverride).toHaveBeenCalledWith('a2', 'Withdrawn by Velocity'));
    unmount();
    wrap(<VendorsScreen live={{ ...base, submissions: [{ ...dup, override: { reason: 'Withdrawn by Velocity', at: '2026-11-10' } }], onOverride }} />);
    expect(screen.getByText(/Duplicate overridden: held by Velocity/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forward to client' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review dispute' })).not.toBeInTheDocument();
  });
  it('without the account manager key there is no Review dispute', () => {
    const dup = { id: 'a2', vendor: 'Second', candidate: 'Ravi', job: 'Java', jobId: 'j1', clientJob: true, at: '2026-11-09T10:00:00Z', quoted: null, cap: null, overBy: null, overCap: false, exception: null, duplicate: { holder: 'Velocity', until: null }, rightToRepresent: true, consent: true, status: 'pending' as const };
    wrap(<VendorsScreen live={{ state: 'ready', onRetry: vi.fn(), vendors: [], showRegister: false, defaultTab: 'submissions', submissions: [dup], canManage: false, canForward: false, canReview: true, onAdd: vi.fn(), onEdit: vi.fn(), onShare: vi.fn(), onException: vi.fn(), loadContacts: vi.fn(), onForward: vi.fn(), onAccept: vi.fn(), onReject: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Review dispute' })).not.toBeInTheDocument();
  });
});
