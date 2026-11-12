import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { IncidentComposerScreen } from './console-ops';
import { companyView, type IncidentLiveRow, type LiveIncidents } from './console-incidents-live';
import { AvailabilityBanner, PAYROLL_DAY_NOTE } from '../settings/help';

// Console C-8, YX-10 incidents and answer 1124: the live incidents screen and the company banner.
const wrap = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const iso = (h: number, m = 0) => new Date(2026, 10, 12, h, m).toISOString();
const update = (o: Partial<IncidentLiveRow['updates'][number]> = {}): IncidentLiveRow['updates'][number] => ({ id: 'u1', stage: 'identified', impact: 'Payslip PDFs take up to 40 seconds to open.', action: 'No action needed.', nextUpdateAt: iso(10, 30), payrollNote: false, status: 'posted', writtenBy: 'Anand Iyer', mine: false, reviewedBy: 'Farah Siddiqui', reviewNote: null, createdAt: iso(9), ...o });
const row = (o: Partial<IncidentLiveRow> = {}): IncidentLiveRow => ({ id: 'i1', ref: 'INC-044', title: 'Payslip PDFs slow to open', severity: 2, products: ['hrms'], status: 'open', stage: 'identified', openedAt: iso(8, 51), openedBy: 'Anand Iyer', resolvedAt: null, securityBreach: false, breach: null, updates: [update()], ...o });
const live = (o: Partial<LiveIncidents> = {}): LiveIncidents => ({
  state: 'ready',
  onRetry: () => {},
  incidents: [row()],
  containments: [{ id: 'c1', company: 'Godavari Agro', containedAt: iso(6), certinDueAt: iso(12), dpdpDueAt: new Date(2026, 10, 15, 6).toISOString(), open: true }],
  products: [{ code: 'hrms', name: 'YukthiX HR' }],
  settings: { leadHours: 1, leadHoursDefault: 1 },
  onOpen: vi.fn().mockResolvedValue(undefined),
  onUpdate: vi.fn().mockResolvedValue(undefined),
  onReview: vi.fn().mockResolvedValue(undefined),
  onMarkBreach: vi.fn().mockResolvedValue(undefined),
  onSaveSettings: vi.fn().mockResolvedValue(undefined),
  ...o,
});
const show = (l: LiveIncidents) => wrap(<IncidentComposerScreen incidents={[]} me="" now={new Date()} liveIncidents={l} />);

describe('Incidents (live)', () => {
  it('lists incidents and shows what companies see now', () => {
    show(live());
    expect(screen.getByText('INC-044')).toBeInTheDocument();
    expect(screen.getByText('YukthiX HR')).toBeInTheDocument();
    expect(screen.getAllByText(/Payslip PDFs take up to 40 seconds to open/).length).toBeGreaterThan(0);
  });

  it('companies never see a security breach, nor an update not yet approved', () => {
    expect(companyView([row({ securityBreach: true })])).toBeNull();
    expect(companyView([row({ updates: [update({ status: 'pending' })] })])).toBeNull();
    expect(companyView([row({ status: 'resolved' })])).toBeNull();
    expect(companyView([row({ id: 'a', severity: 3, title: 'Minor' }), row({ id: 'b', severity: 1, title: 'Major' })])?.title).toBe('Major');
  });

  it('declaring needs a title, a product and the impact; then it is sent for approval', async () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    show(live({ onOpen }));
    await userEvent.click(screen.getByRole('button', { name: 'Declare incident' }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send for approval' }));
    expect(within(drawer).getByText('Write a title of at least 3 characters.')).toBeInTheDocument();
    expect(within(drawer).getByText('Choose at least one affected product.')).toBeInTheDocument();
    expect(within(drawer).getByText(/Say in plain words what companies notice/)).toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the writer cannot approve their own update', async () => {
    show(live({ incidents: [row({ updates: [update({ id: 'u2', status: 'pending', mine: true, reviewedBy: null })] })], defaultOpen: 'i1' }));
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Waiting: another staff member approves your update.')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Approve and post' })).toBeNull();
  });

  it('another staff member approves; sending back needs a note', async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    show(live({ incidents: [row({ updates: [update({ id: 'u2', status: 'pending', reviewedBy: null })] })], defaultOpen: 'i1', onReview }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send back' }));
    expect(within(drawer).getByText('Say what to change before sending it back.')).toBeInTheDocument();
    expect(onReview).not.toHaveBeenCalled();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Approve and post' }));
    await waitFor(() => expect(onReview).toHaveBeenCalledWith('i1', 'u2', true));
  });

  it('marking a breach needs the contained company; a linked breach shows both clocks', async () => {
    const onMarkBreach = vi.fn().mockResolvedValue(undefined);
    const { unmount } = show(live({ defaultOpen: 'i1', onMarkBreach }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.click(within(drawer).getByRole('button', { name: 'Mark as security breach' }));
    expect(within(drawer).getByText('Choose the contained company.')).toBeInTheDocument();
    expect(onMarkBreach).not.toHaveBeenCalled();
    unmount();
    const c = live().containments[0]!;
    show(live({ defaultOpen: 'i1', incidents: [row({ securityBreach: true, breach: { ...c, certinRemindedAt: iso(11), dpdpRemindedAt: null } })] }));
    const d2 = await screen.findByRole('dialog');
    expect(within(d2).getByText(/Security breach: Godavari Agro/)).toBeInTheDocument();
    expect(within(d2).getByText(/CERT-In report due .*\(reminded/)).toBeInTheDocument();
    expect(within(d2).getByText(/Other companies never see this incident/)).toBeInTheDocument();
  });

  it('the reminder lead cannot be saved empty; a valid one is saved', async () => {
    const onSaveSettings = vi.fn().mockResolvedValue(undefined);
    show(live({ onSaveSettings }));
    const field = screen.getByRole('textbox', { name: /Hours before the CERT-In and DPDP due times/ });
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    expect(onSaveSettings).not.toHaveBeenCalled();
    await userEvent.type(field, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save rule' }));
    await waitFor(() => expect(onSaveSettings).toHaveBeenCalledWith(2));
  });
});

describe('What companies see (banner)', () => {
  it('a Sev-1 incident is an alert; others a status, with the next update time', () => {
    const { unmount } = render(<AvailabilityBanner kind="degraded" incident={{ title: 'Sign-in down', severity: 1, stage: 'investigating', impact: 'Nobody can sign in.', action: 'Try again later.', nextUpdateAt: null, updatedAt: iso(9) }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in down (investigating): Nobody can sign in. Try again later.');
    unmount();
    render(<AvailabilityBanner kind="degraded" incident={{ title: 'Slow PDFs', severity: 2, stage: 'identified', impact: 'Slow.', action: 'No action needed.', nextUpdateAt: iso(10, 30), updatedAt: iso(9) }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Next update by/);
  });
});

describe('Answer 1206: the payroll-day note', () => {
  const base = { title: 'Slow PDFs', severity: 2, stage: 'identified', impact: 'Slow.', action: 'No action needed.', nextUpdateAt: null, updatedAt: iso(9) };
  it('ticked: the banner adds the sentence word for word', () => {
    render(<AvailabilityBanner kind="degraded" incident={{ ...base, payrollNote: true }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Payroll is not affected: pay runs, payslips and bank files continue as normal.');
    expect(PAYROLL_DAY_NOTE).toBe('Payroll is not affected: pay runs, payslips and bank files continue as normal.');
  });

  it('unticked: no payroll sentence', () => {
    render(<AvailabilityBanner kind="degraded" incident={{ ...base, payrollNote: false }} />);
    expect(screen.getByRole('status')).not.toHaveTextContent('Payroll is not affected');
  });

  it('staff tick it in the update form and it is sent', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    show(live({ defaultOpen: 'i1', onUpdate }));
    const drawer = await screen.findByRole('dialog');
    await userEvent.type(within(drawer).getByRole('textbox', { name: /Impact in plain words/ }), 'Payslip PDFs are slow to open.');
    await userEvent.type(within(drawer).getByRole('textbox', { name: /What companies should do/ }), 'No action needed.');
    await userEvent.click(within(drawer).getByRole('checkbox', { name: /payroll-day note/ }));
    expect(within(drawer).getByText(/Payroll is not affected/)).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('i1', expect.objectContaining({ payrollNote: true })));
  });
});
