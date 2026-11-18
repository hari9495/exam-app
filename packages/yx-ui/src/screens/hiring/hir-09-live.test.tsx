import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { OfferBuilderScreen, OfferRecordScreen } from './hiring-offers';
import type { LiveOfferBuilder, LiveOfferRecord, OfferPreview, OfferRecordView, OfferSetupView } from './live/types';

// HIR-09 offer builder and record, HIR-29 conditions: the designed screens with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);
const NOW = new Date('2026-11-09T06:00:00Z');

const SETUP: OfferSetupView = {
  entryId: 'e1',
  candidate: { id: 'c1', name: 'Joseph George' },
  job: { id: 'j1', title: 'Senior QA Engineer', locationId: 'l1' },
  company: 'Kaveri Foods Pvt Ltd',
  grade: { id: 'g6', name: 'G6' },
  band: { min: 12_00_000, max: 18_00_000 },
  structures: [{ value: 'tv1', label: 'Standard CTC' }],
  locations: [{ value: 'l1', label: 'Chennai office' }],
  letters: [{ value: 't1', label: 'Offer letter', esign: false, subject: 'Your offer', body: 'Dear {{candidateName}},\n\nWe offer you {{jobTitle}} with {{compensation}}.' }],
  defaultConditions: ['Background check clear'],
  route: { steps: [{ name: 'Hiring head', approvers: ['Lakshmi'] }], bandStep: { name: 'Above the pay range (HR head)', approvers: ['Meena'] } },
};
const preview = (above = false): OfferPreview => ({
  lines: [
    { key: 'BASIC', label: 'Basic', kind: 'earning', annual: 6_40_000, monthly: 53_333 },
    { key: 'PF_ER', label: 'Employer PF', kind: 'employer', annual: 21_600, monthly: 1_800 },
  ],
  monthlyGross: 1_31_533,
  bandPosition: above ? 'above' : 'within',
  bandText: above ? 'Above the grade pay range. Needs extra approval.' : 'Within the grade pay range.',
  extraApproval: above,
  warnings: [],
});
const builder = (over: Partial<LiveOfferBuilder> = {}): LiveOfferBuilder => ({
  state: 'ready',
  onRetry: vi.fn(),
  setup: SETUP,
  now: NOW,
  onPreview: vi.fn(async () => preview()),
  onFinish: vi.fn(async () => 'Sent for approval'),
  onSaveDraft: vi.fn(async () => undefined),
  ...over,
});

describe('HIR-09 offer builder (live)', () => {
  it('pressed too early: the CTC error shows and gets the focus; nothing is sent', async () => {
    const live = builder();
    show(<OfferBuilderScreen live={live} />);
    expect(screen.getByRole('heading', { name: /New offer · Joseph George/ })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a fixed CTC above ₹0.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.id).toBe('ob-ctc'));
    expect(live.onPreview).not.toHaveBeenCalled();
    expect(live.onFinish).not.toHaveBeenCalled();
  });

  it('answer 532: ₹0 is refused like blank, with the bulk offers words; above 0 goes on', async () => {
    const live = builder();
    show(<OfferBuilderScreen live={live} />);
    await ue.type(screen.getByLabelText(/Fixed CTC/), '0');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a fixed CTC above ₹0.')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.id).toBe('ob-ctc'));
    expect(live.onPreview).not.toHaveBeenCalled();
    await ue.clear(screen.getByLabelText(/Fixed CTC/));
    await ue.type(screen.getByLabelText(/Fixed CTC/), '1600000');
    await waitFor(() => expect(live.onPreview).toHaveBeenCalled());
    expect(screen.queryByText('Enter a fixed CTC above ₹0.')).not.toBeInTheDocument();
  });

  it('shows Pay’s CTC lines with employer costs and the band check; above the range is flagged', async () => {
    const live = builder({ onPreview: vi.fn(async () => preview(true)) });
    show(<OfferBuilderScreen live={live} />);
    await ue.type(screen.getByLabelText(/Fixed CTC/), '2050000');
    await waitFor(() => expect(live.onPreview).toHaveBeenCalledWith(expect.objectContaining({ templateVersionId: 'tv1', annualCtc: 2_050_000, locationId: 'l1' })));
    expect(await screen.findByText('Basic')).toBeInTheDocument();
    expect(screen.getByText('Employer PF')).toBeInTheDocument();
    expect(screen.getAllByText('Above the grade pay range. Needs extra approval.').length).toBeGreaterThan(0);
  });

  it('a whole offer: terms, letter with the company template, route; finish sends it on with a toast', async () => {
    const live = builder();
    show(<OfferBuilderScreen live={live} />);
    await ue.type(screen.getByLabelText(/Fixed CTC/), '1600000');
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    // Terms pressed too early: the joining date is asked for.
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Choose the joining date.')).toBeInTheDocument();
    expect(live.onFinish).not.toHaveBeenCalled();
  });

  it('loading, no access and not found states', () => {
    const { rerender } = show(<OfferBuilderScreen live={builder({ state: 'loading', setup: null })} />);
    expect(screen.getByLabelText('Loading the offer')).toBeInTheDocument();
    rerender(<ToastProvider><OfferBuilderScreen live={builder({ state: 'denied', setup: null })} /></ToastProvider>);
    expect(screen.getByText(/offer-pay key/)).toBeInTheDocument();
    rerender(<ToastProvider><OfferBuilderScreen live={builder({ state: 'not-found', setup: null })} /></ToastProvider>);
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });
});

const OFFER: OfferRecordView = {
  id: 'o1',
  status: 'sent',
  entryId: 'e1',
  candidate: { id: 'c1', name: 'Joseph George' },
  job: { id: 'j1', title: 'Senior QA Engineer' },
  grade: 'G6',
  location: 'Chennai office',
  currentVersion: 2,
  startDate: '2026-12-01',
  expiresAt: '2026-11-20T18:29:00.000Z',
  esign: false,
  canSeePay: true,
  templateId: 't1',
  current: { version: 2, letterKind: 'offer', templateVersionId: 'tv1', locationId: 'l1', bandPosition: 'within', bandText: 'Within the grade pay range.', extraApproval: false, annualCtc: 17_00_000, variablePay: 0, joiningBonus: 0, clawbackMonths: null, lines: preview().lines },
  versions: [
    { version: 2, current: true, at: '2026-11-08T10:00:00Z', by: 'Neha', note: 'Counter-offer', needsApproval: true, annualCtc: 17_00_000 },
    { version: 1, current: false, at: '2026-11-05T10:00:00Z', by: 'Neha', note: null, needsApproval: true, annualCtc: 16_00_000 },
  ],
  conditions: [
    { id: 'k1', name: 'Background check clear', dueOn: '2026-12-01', status: 'open', reason: null },
    { id: 'k2', name: 'Relieving letter', dueOn: '2026-12-01', status: 'waived', reason: 'Notice bought out' },
  ],
  approval: null,
  activity: [{ id: 'a1', actor: 'Neha', action: 'sent the offer to the candidate', at: '2026-11-08T11:00:00Z' }],
  joiner: null,
};
const rec = (over: Partial<LiveOfferRecord> = {}, offer: Partial<OfferRecordView> = {}): LiveOfferRecord => ({
  state: 'ready',
  onRetry: vi.fn(),
  offer: { ...OFFER, ...offer },
  now: NOW,
  onBack: vi.fn(),
  onRevise: vi.fn(),
  onSubmit: vi.fn(async () => 'Sent for approval'),
  onSend: vi.fn(async () => undefined),
  onWithdraw: vi.fn(async () => undefined),
  onCancelApproval: vi.fn(async () => undefined),
  onLetter: vi.fn(async () => undefined),
  onRemind: vi.fn(async () => 'Reminder sent'),
  onCreateEmployee: vi.fn(),
  onAddCondition: vi.fn(async () => undefined),
  onMet: vi.fn(async () => undefined),
  onWaive: vi.fn(async () => undefined),
  ...over,
});

describe('HIR-09 offer record and HIR-29 conditions (live)', () => {
  it('answer 336: Send reminder on a sent offer and on an accepted one with open conditions; never on a draft or when nothing is open', async () => {
    const sent = rec();
    const first = show(<OfferRecordScreen live={sent} />);
    await ue.click(screen.getByRole('button', { name: 'Send reminder' }));
    await waitFor(() => expect(sent.onRemind).toHaveBeenCalled());
    expect((await screen.findAllByText('Reminder sent')).length).toBeGreaterThan(0);
    first.unmount();
    const acc = show(<OfferRecordScreen live={rec({}, { status: 'accepted', joiner: { id: 'p1', status: 'invited' } })} />);
    expect(screen.getByRole('button', { name: 'Send reminder' })).toBeInTheDocument();
    acc.unmount();
    const done = show(<OfferRecordScreen live={rec({}, { status: 'accepted', joiner: { id: 'p1', status: 'invited' }, conditions: OFFER.conditions.map((c) => ({ ...c, status: 'met' as const })) })} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
    done.unmount();
    show(<OfferRecordScreen live={rec({}, { status: 'draft' })} />);
    expect(screen.queryByRole('button', { name: 'Send reminder' })).not.toBeInTheDocument();
  });

  it('M10 D4: an issued letter shows its reference and downloads; before it is sent the menu previews the letter', async () => {
    const sent = rec({}, { status: 'sent', letter: { referenceNo: 'KF/OFR/2026/000012', status: 'issued' } });
    const first = show(<OfferRecordScreen live={sent} />);
    expect(screen.getByText('KF/OFR/2026/000012')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Download letter' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Preview letter' })).not.toBeInTheDocument();
    first.unmount();
    const approved = rec({}, { status: 'approved', letter: null });
    show(<OfferRecordScreen live={approved} />);
    expect(screen.queryByText(/OFR/)).not.toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'More actions' }));
    await ue.click(screen.getByRole('menuitem', { name: 'Preview letter' }));
    await waitFor(() => expect(approved.onLetter).toHaveBeenCalled());
  });

  it('shows the CTC lines, the versions with history and the activity; Revise opens the builder', async () => {
    const live = rec();
    show(<OfferRecordScreen live={live} />);
    expect(screen.getByText('₹17,00,000')).toBeInTheDocument();
    expect(screen.getByText('Basic')).toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: /Versions/ }));
    const list = screen.getByRole('list', { name: 'Offer versions' });
    expect(within(list).getByText('Version 2 · ₹17,00,000')).toBeInTheDocument();
    expect(within(list).getByText('Superseded')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Revise offer' }));
    expect(live.onRevise).toHaveBeenCalled();
  });

  it('without the offer-pay key: no amounts, no Revise; the offer and its conditions still show', async () => {
    show(<OfferRecordScreen live={rec({}, { canSeePay: false, current: { version: 2, letterKind: 'offer', templateVersionId: 'tv1', locationId: 'l1', bandPosition: 'within', bandText: '', extraApproval: false }, versions: OFFER.versions.map((v) => ({ ...v, annualCtc: null })) })} />);
    expect(screen.getByText('Pay hidden')).toBeInTheDocument();
    expect(screen.queryByText('₹17,00,000')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revise offer' })).not.toBeInTheDocument();
    await ue.click(screen.getByRole('tab', { name: /Conditions/ }));
    expect(screen.getByText('Background check clear')).toBeInTheDocument();
  });

  it('conditions: met at once; waiving needs a reason (pressed too early: the error and the focus)', async () => {
    const live = rec();
    show(<OfferRecordScreen live={live} defaultTab="conditions" />);
    expect(screen.getByText('Reason: Notice bought out')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Waive with reason' }));
    const d = screen.getByRole('dialog');
    await ue.click(within(d).getByRole('button', { name: 'Waive' }));
    expect(within(d).getByText('Say why it is waived, in a few words.')).toBeInTheDocument();
    expect(live.onWaive).not.toHaveBeenCalled();
    await ue.type(within(d).getByLabelText(/Reason/), 'Check done by the old employer');
    await ue.click(within(d).getByRole('button', { name: 'Waive' }));
    await waitFor(() => expect(live.onWaive).toHaveBeenCalledWith('k1', 'Check done by the old employer'));
    await ue.click(screen.getByRole('button', { name: 'Mark met' }));
    await waitFor(() => expect(live.onMet).toHaveBeenCalledWith('k1'));
    expect((await screen.findAllByText('Background check clear: met')).length).toBeGreaterThan(0);
  });

  it('status-led actions: draft sends for approval; approved sends; accepted opens People; withdrawn has no actions', async () => {
    const draft = rec({}, { status: 'draft' });
    const { unmount } = show(<OfferRecordScreen live={draft} />);
    await ue.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(draft.onSubmit).toHaveBeenCalled());
    expect((await screen.findAllByText('Sent for approval')).length).toBeGreaterThan(0);
    unmount();
    const accepted = rec({}, { status: 'accepted' });
    const second = show(<OfferRecordScreen live={accepted} />);
    await ue.click(screen.getByRole('button', { name: 'Create employee' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Open in People' }));
    expect(accepted.onCreateEmployee).toHaveBeenCalled();
    second.unmount();
    show(<OfferRecordScreen live={rec({}, { status: 'withdrawn' })} />);
    expect(screen.getByText('Offer withdrawn')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Revise offer|Send/ })).not.toBeInTheDocument();
  });
});
