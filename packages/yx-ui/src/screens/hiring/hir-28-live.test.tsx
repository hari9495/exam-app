import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/notify';
import { BulkOfferScreen } from './hiring-offers';
import type { BulkBatchView, BulkOfferSetup, LiveBulkOffers } from './live/types';

// HIR-28 bulk offers: the designed screen with `live`, positive and negative.
const ue = userEvent.setup({ pointerEventsCheck: 0 });
const show = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

const SETUP: BulkOfferSetup = {
  job: { id: 'j1', title: 'Graduate Engineer Trainee', locationId: 'l1' },
  company: 'Kaveri Foods Pvt Ltd',
  grade: 'G3',
  band: { min: 4_20_000, max: 5_00_000 },
  structures: [{ value: 'tv1', label: 'GET CTC' }],
  locations: [{ value: 'l1', label: 'Hosur plant' }],
  letters: [{ value: 't1', label: 'Campus LOI', esign: true, subject: 'LOI', body: 'Dear {{candidateName}},\n\nWe offer {{compensation}}.' }],
  defaultConditions: ['Background check clear'],
  expiryDays: 7,
  plan: { check: 'hold', linked: true, free: 2 },
  route: { steps: [], bandStep: { name: 'Above the pay range (HR head)', approvers: ['Lakshmi'] } },
  candidates: [
    { entryId: 'e1', name: 'Aditi Rao', email: 'aditi@mail.test' },
    { entryId: 'e2', name: 'Farhan Sheikh', email: 'farhan@mail.test' },
    { entryId: 'e3', name: 'Ishita Bose', email: 'ishita@mail.test' },
  ],
};
const live = (over: Partial<LiveBulkOffers> = {}): LiveBulkOffers => ({ state: 'ready', onRetry: vi.fn(), setup: SETUP, now: new Date('2026-11-09T06:00:00Z'), onSend: vi.fn(async () => undefined), onOpenOffer: vi.fn(), ...over });

describe('HIR-28 bulk offers (live)', () => {
  it('pressed too early: the joining date is asked for, then the CTC of each candidate; nothing is sent', async () => {
    const l = live();
    show(<BulkOfferScreen live={l} defaultStep="template" />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Choose the joining date.')).toBeInTheDocument();
    expect(l.onSend).not.toHaveBeenCalled();
  });

  it('rows beyond the free places on the plan line are held; the finish button counts only the offers that go', async () => {
    show(<BulkOfferScreen live={live()} defaultStep="values" />);
    expect(screen.getByText('1 without a free plan line')).toBeInTheDocument();
    expect(screen.getAllByText('No plan line').length).toBeGreaterThan(0);
    // Unticking one frees its place: nothing is held any more.
    await ue.click(screen.getByRole('checkbox', { name: /Ishita Bose/ }));
    expect(screen.queryByText(/without a free plan line/)).not.toBeInTheDocument();
  });

  it('values step pressed too early names the candidates with no CTC', async () => {
    show(<BulkOfferScreen live={live()} defaultStep="values" />);
    await ue.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Enter the fixed CTC for Aditi Rao, Farhan Sheikh, Ishita Bose/)).toBeInTheDocument();
  });

  it('the sent page: each candidate’s result, the counts, and the offer opens', async () => {
    const batch: BulkBatchView = {
      id: 'b1', status: 'done', job: { id: 'j1', title: 'Graduate Engineer Trainee' }, startDate: '2027-07-05', expiresAt: '2026-11-16', canSeePay: true,
      rows: [
        { entryId: 'e1', name: 'Aditi Rao', annualCtc: 4_80_000, status: 'sent', offerId: 'o1', reason: null, offerStatus: 'sent', esign: true, band: 'Within the grade pay range.' },
        { entryId: 'e2', name: 'Farhan Sheikh', annualCtc: 5_40_000, status: 'pending_approval', offerId: 'o2', reason: null, offerStatus: 'pending_approval', esign: false, band: 'Above the grade pay range. Needs extra approval.' },
        { entryId: 'e3', name: 'Ishita Bose', annualCtc: 4_80_000, status: 'held', offerId: null, reason: 'No free place on the headcount-plan line.', offerStatus: null, esign: false, band: 'Within the grade pay range.' },
        { entryId: 'e4', name: 'Harsha V', annualCtc: 4_80_000, status: 'failed', offerId: null, reason: 'This candidate’s details were erased.', offerStatus: null, esign: false, band: null },
      ],
    };
    const l = live({ setup: null, batch });
    show(<BulkOfferScreen live={l} />);
    const table = screen.getByRole('table', { name: /Each candidate/ });
    expect(within(table).getByText('Waiting for extra approval')).toBeInTheDocument();
    expect(within(table).getByText('Held: no plan line')).toBeInTheDocument();
    expect(within(table).getByText('This candidate’s details were erased.')).toBeInTheDocument();
    await ue.click(within(table).getAllByRole('button', { name: 'Open offer' })[0]!);
    expect(l.onOpenOffer).toHaveBeenCalledWith('o1');
    // Without the offer-pay key there is no CTC column.
    const noPay = { ...batch, canSeePay: false, rows: batch.rows.map((r) => ({ ...r, annualCtc: null })) };
    show(<BulkOfferScreen live={live({ setup: null, batch: noPay })} />);
    await waitFor(() => expect(screen.getAllByRole('table', { name: /Each candidate/ })[1]).toBeDefined());
    expect(within(screen.getAllByRole('table', { name: /Each candidate/ })[1]!).queryByText('₹4,80,000')).not.toBeInTheDocument();
  });

  it('states: loading, no access, not found', () => {
    const { rerender } = show(<BulkOfferScreen live={live({ state: 'loading', setup: null })} />);
    expect(screen.getByLabelText('Loading the bulk offers')).toBeInTheDocument();
    rerender(<ToastProvider><BulkOfferScreen live={live({ state: 'denied', setup: null })} /></ToastProvider>);
    expect(screen.getByText(/offer-pay key/)).toBeInTheDocument();
    rerender(<ToastProvider><BulkOfferScreen live={live({ state: 'not-found', setup: null })} /></ToastProvider>);
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });
});
