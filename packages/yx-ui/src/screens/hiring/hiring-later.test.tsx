import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BulkOfferScreen, SealedCopyNote } from './hiring-offers';
import { DayBoard, type DayBoardProps } from './interview-day';
import type { BulkBatchView, BulkOfferSetup, LiveBulkOffers } from './live/types';

// The founder's "later" list, offers and interviews (377, 401, 405, 421, 422). Positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const SETUP: BulkOfferSetup = {
  job: { id: 'j1', title: 'Graduate Engineer Trainee', locationId: 'l1' },
  company: 'Kaveri Foods Pvt Ltd',
  grade: 'G3',
  band: null,
  structures: [{ value: 'tv1', label: 'GET CTC' }],
  locations: [{ value: 'l1', label: 'Hosur plant', legalEntityId: 'le1' }],
  joinerBatches: [
    { value: 'jb1', label: 'GET 2027 · 5 Jul batch', joiningOn: '2027-07-05', legalEntityId: 'le1' },
    { value: 'jb2', label: 'Other entity batch', joiningOn: '2027-07-05', legalEntityId: 'le2' },
    { value: 'jb3', label: 'August batch', joiningOn: '2027-08-02', legalEntityId: 'le1' },
  ],
  letters: [{ value: 't1', label: 'Campus LOI', esign: true, subject: 'LOI', body: 'Dear {{candidateName}}' }],
  defaultConditions: [],
  expiryDays: 7,
  plan: { check: 'off', linked: false, free: null },
  route: { steps: [], bandStep: { name: 'Above the pay range', approvers: [] } },
  candidates: [{ entryId: 'e1', name: 'Aditi Rao', email: 'aditi@mail.test' }],
};
const bulk = (over: Partial<LiveBulkOffers> = {}): LiveBulkOffers => ({ state: 'ready', onRetry: vi.fn(), setup: SETUP, now: new Date('2026-11-09T06:00:00Z'), onSend: vi.fn(async () => undefined), onOpenOffer: vi.fn(), ...over });

describe('401: bulk offers join a People joiner batch', () => {
  it('offers only open batches on the joining day for the location’s legal entity', async () => {
    show(<BulkOfferScreen live={bulk()} defaultStep="template" />);
    await ue.type(screen.getByRole('textbox', { name: /Joining date/ }), '05/07/2027{Enter}');
    await ue.click(screen.getByRole('combobox', { name: 'People joiner batch' }));
    expect(await screen.findByRole('option', { name: 'GET 2027 · 5 Jul batch' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Other entity batch' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'August batch' })).toBeNull();
  });
  it('negative: no batch on that day says so; the batch stays optional', async () => {
    show(<BulkOfferScreen live={bulk()} defaultStep="template" />);
    await ue.type(screen.getByRole('textbox', { name: /Joining date/ }), '06/07/2027{Enter}');
    expect(screen.getByText(/No open joiner batch on this joining day/)).toBeInTheDocument();
  });
});

const BATCH: BulkBatchView = {
  id: 'b1', status: 'running', job: { id: 'j1', title: 'GET' }, startDate: '2027-07-05', expiresAt: '2026-11-16', canSeePay: true,
  progress: { done: 1, total: 2 }, joinerBatch: { id: 'jb1', name: 'GET 2027 · 5 Jul batch' },
  rows: [
    { entryId: 'e1', name: 'Aditi Rao', annualCtc: 650000, status: 'sent', offerId: 'o1', reason: null, offerStatus: 'sent', esign: true, band: null },
    { entryId: 'e2', name: 'Farhan Sheikh', annualCtc: 650000, status: 'draft', offerId: null, reason: null, offerStatus: null, esign: false, band: null },
  ],
};

describe('405: the batch sends in the background', () => {
  it('shows how far it is; a row still to go says waiting, not "not sent"; the joiner batch is named', () => {
    show(<BulkOfferScreen live={bulk({ setup: null, batch: BATCH })} />);
    expect(screen.getByText('Sending in the background: 1 of 2 done')).toBeInTheDocument();
    expect(screen.getByText('Waiting to send')).toBeInTheDocument();
    expect(screen.getByText(/join the People batch GET 2027 · 5 Jul batch/)).toBeInTheDocument();
  });
  it('negative: a finished batch has no progress line', () => {
    show(<BulkOfferScreen live={bulk({ setup: null, batch: { ...BATCH, status: 'done', progress: { done: 2, total: 2 }, rows: [BATCH.rows[0]!] } })} />);
    expect(screen.queryByText(/Sending in the background/)).toBeNull();
    expect(screen.queryByText('Waiting to send')).toBeNull();
  });
});

describe('377: the sealed copy of an e-signed offer', () => {
  it('made: download it', async () => {
    const onDownload = vi.fn();
    show(<SealedCopyNote state="made" onDownload={onDownload} />);
    await ue.click(screen.getByRole('button', { name: 'Download sealed copy' }));
    expect(onDownload).toHaveBeenCalled();
  });
  it('negative: missing says so and offers to make it again', async () => {
    const onMake = vi.fn();
    show(<SealedCopyNote state="missing" onMake={onMake} />);
    expect(screen.getByText('The sealed copy was not made')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download sealed copy' })).toBeNull();
    await ue.click(screen.getByRole('button', { name: 'Make the sealed copy' }));
    expect(onMake).toHaveBeenCalled();
  });
});

const PANELS = [{ id: 'pa', name: 'Panel A', members: 'Prakash', room: 'Room 1' }, { id: 'pb', name: 'Panel B', members: 'Deepa', room: 'Room 2' }];
const board = (over: Partial<DayBoardProps> = {}): DayBoardProps => ({
  drive: 'GET', date: new Date(2026, 10, 14), panels: PANELS, slots: [600, 645], status: 'draft', assignedYet: true, canManage: true,
  placed: [
    { id: 'r1', candidate: 'Aditi Rao', panel: 'pa', start: 600, result: 'ready' },
    { id: 'r2', candidate: 'Farhan Sheikh', panel: 'pb', start: 600, result: 'ready' },
    { id: 'r3', candidate: 'Ishita Bose', panel: 'pa', start: 645, result: 'sent' },
  ],
  unassigned: [], onAssign: vi.fn(), onSend: vi.fn(), onSwap: vi.fn(async () => undefined), ...over,
});

describe('422: swap two unsent candidates', () => {
  it('"Swap with…" asks who (nothing sent without it), then swaps the two rows', async () => {
    const p = board();
    show(<DayBoard {...p} />);
    await ue.click(screen.getByRole('button', { name: 'Swap Aditi Rao with someone' }));
    const d = screen.getByRole('dialog', { name: /Swap Aditi Rao with/ });
    await ue.click(within(d).getByRole('button', { name: 'Swap' }));
    expect(within(d).getByText('Choose who they swap with.')).toBeInTheDocument();
    expect(p.onSwap).not.toHaveBeenCalled();
    await ue.click(within(d).getByRole('combobox', { name: 'Swap with' }));
    expect(screen.queryByRole('option', { name: /Ishita Bose/ })).toBeNull(); // already sent
    await ue.click(await screen.findByRole('option', { name: /Farhan Sheikh/ }));
    await ue.click(within(d).getByRole('button', { name: 'Swap' }));
    await waitFor(() => expect(p.onSwap).toHaveBeenCalledWith('r1', 'r2'));
  });
  it('negative: a sent candidate has no swap; without the key nobody does', () => {
    const { unmount } = show(<DayBoard {...board()} />);
    expect(screen.queryByRole('button', { name: 'Swap Ishita Bose with someone' })).toBeNull();
    unmount();
    show(<DayBoard {...board({ canManage: false })} />);
    expect(screen.queryByRole('button', { name: /^Swap .* with someone$/ })).toBeNull();
  });
});

describe('421: WhatsApp reminders on the interview day', () => {
  it('connected: the switch turns them off for the day', async () => {
    const onChange = vi.fn(async () => undefined);
    show(<DayBoard {...board({ reminders: { on: true, connected: true, onChange } })} />);
    await ue.click(screen.getByRole('switch', { name: /Send WhatsApp reminders/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(false));
  });
  it('negative: not connected says so, never pretends to send, and the switch cannot turn on', async () => {
    const onChange = vi.fn(async () => undefined);
    show(<DayBoard {...board({ reminders: { on: true, connected: false, onChange }, placed: [{ id: 'r3', candidate: 'Ishita Bose', panel: 'pa', start: 645, result: 'sent', reminder: 'not_connected' }] })} />);
    expect(screen.getByText('WhatsApp is not connected')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp not connected')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Send WhatsApp reminders/ })).toHaveAttribute('aria-checked', 'false');
    await ue.click(screen.getByRole('switch', { name: /Send WhatsApp reminders/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByText(/WhatsApp is not connected. Ask your admin/)).toBeInTheDocument();
  });
});
