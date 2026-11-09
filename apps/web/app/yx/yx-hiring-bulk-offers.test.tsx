import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@yukthix/ui';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxOfferBatchPage from './(app)/hiring/offer-batches/[id]/page';
import YxBulkOffersPage from './(app)/hiring/jobs/[id]/bulk-offers/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// HIR-28 bulk offers: the designed screen with `live` on the batch API; the job's setup and a batch's results.
const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
const api = apiFetch as jest.Mock;
const push = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 't' });
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
});

describe('HIR-28 bulk offers pages', () => {
  it('the builder reads the job setup: candidates, the plan check and the grade range', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
    api.mockImplementation(async (path: string) => {
      if (path === '/hiring/offer-batches/setup?jobId=j1')
        return {
          job: { id: 'j1', title: 'Graduate Engineer Trainee', locationId: 'l1' }, company: 'Kaveri', grade: 'G3', band: { min: 420000, max: 500000 },
          structures: [{ value: 'tv1', label: 'GET CTC' }], locations: [{ value: 'l1', label: 'Hosur plant' }], letters: [{ value: 't1', label: 'Campus LOI', esign: true, subject: 'LOI', body: 'Dear {{candidateName}}' }],
          defaultConditions: [], expiryDays: 7, plan: { check: 'hold', linked: true, free: 1 }, route: { steps: [], bandStep: { name: 'Above the pay range (HR head)', approvers: ['Lakshmi'] } },
          candidates: [{ entryId: 'e1', name: 'Aditi Rao', email: 'a@x.test' }, { entryId: 'e2', name: 'Farhan Sheikh', email: 'f@x.test' }],
        };
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxBulkOffersPage />);
    expect(await screen.findByRole('heading', { name: /Bulk offers · Graduate Engineer Trainee/ })).toBeInTheDocument();
  });

  it('answer 402: candidates ticked on the board start chosen; without a choice everyone does', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
    const setup = {
      job: { id: 'j1', title: 'Graduate Engineer Trainee', locationId: 'l1' }, company: 'Kaveri', grade: 'G3', band: { min: 420000, max: 500000 },
      structures: [{ value: 'tv1', label: 'GET CTC' }], locations: [{ value: 'l1', label: 'Hosur plant' }], letters: [{ value: 't1', label: 'Campus LOI', esign: true, subject: 'LOI', body: 'Dear {{candidateName}}' }],
      defaultConditions: [], expiryDays: 7, plan: { check: 'off', linked: false, free: null }, route: { steps: [], bandStep: { name: 'Above the pay range (HR head)', approvers: ['Lakshmi'] } },
      candidates: [{ entryId: 'e1', name: 'Aditi Rao', email: 'a@x.test' }, { entryId: 'e2', name: 'Farhan Sheikh', email: 'f@x.test' }],
    };
    api.mockImplementation(async (path: string) => {
      if (path === '/hiring/offer-batches/setup?jobId=j1') return setup;
      throw new Error(`unexpected ${path}`);
    });
    (useSearchParams as jest.Mock).mockReturnValue({ get: (k: string) => (k === 'entries' ? 'e2' : null) });
    const { unmount } = wrap(<YxBulkOffersPage />);
    expect(await screen.findByText(/^1 selected/)).toBeInTheDocument();
    unmount();
    (useSearchParams as jest.Mock).mockReturnValue({ get: () => null });
    wrap(<YxBulkOffersPage />);
    expect(await screen.findByText(/^2 selected/)).toBeInTheDocument();
  });

  it('a refusal of the setup (no offer-pay key) shows no access', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'j1' });
    api.mockImplementation(async () => {
      throw Object.assign(new Error('Offer pay needs ats.offer.compensation.view.'), { status: 403 });
    });
    wrap(<YxBulkOffersPage />);
    expect(await screen.findByText(/offer-pay key/)).toBeInTheDocument();
  });

  it('the batch page shows each candidate’s result and opens the offer', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'b1' });
    api.mockImplementation(async (path: string) => {
      if (path === '/hiring/offer-batches/b1')
        return {
          id: 'b1', status: 'done', job: { id: 'j1', title: 'Graduate Engineer Trainee' }, startDate: '2027-07-05', expiresAt: '2026-11-16', canSeePay: true,
          rows: [
            { entryId: 'e1', name: 'Aditi Rao', annualCtc: 480000, status: 'sent', offerId: 'o1', reason: null, offerStatus: 'sent', esign: true, band: 'Within the grade pay range.' },
            { entryId: 'e2', name: 'Farhan Sheikh', annualCtc: 480000, status: 'held', offerId: null, reason: 'No free place on the headcount-plan line.', offerStatus: null, esign: false, band: 'Within the grade pay range.' },
          ],
        };
      throw new Error(`unexpected ${path}`);
    });
    wrap(<YxOfferBatchPage />);
    const table = await screen.findByRole('table', { name: /Each candidate/ });
    expect(within(table).getByText('Held: no plan line')).toBeInTheDocument();
    within(table).getByRole('button', { name: 'Open offer' }).click();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/yx/hiring/offers/o1'));
  });
});
