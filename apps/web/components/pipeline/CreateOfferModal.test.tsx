import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateOfferModal } from './CreateOfferModal';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../ui';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: 'recruiter' }),
}));

const TEMPLATE = { id: null, subject: 'Offer for {{jobTitle}}', body: 'Dear {{candidateName}}, welcome aboard.' };

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/offer-template')) {
      return new Response(JSON.stringify(TEMPLATE), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderModal(onClose = jest.fn()) {
  return render(
    <QueryProvider>
      <ToastProvider>
        <CreateOfferModal entryId="entry-1" candidateId="cand-1" onClose={onClose} />
      </ToastProvider>
    </QueryProvider>,
  );
}

function fillTerms() {
  fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('Expires'), { target: { value: '2026-09-15' } });
}

describe('CreateOfferModal', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:mock'), revokeObjectURL: jest.fn() });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('pre-fills subject/body from the offer template', async () => {
    mockFetch();
    renderModal();

    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveValue('Offer for {{jobTitle}}'));
    expect(screen.getByLabelText('Letter body')).toHaveValue('Dear {{candidateName}}, welcome aboard.');
  });

  it('Preview PDF creates the draft offer then opens the fetched PDF blob', async () => {
    const fetchMock = mockFetch((url, options) => {
      if (url.endsWith('/pipeline/entries/entry-1/offers') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'offer-1', status: 'draft' }), { status: 201 });
      }
      if (url.endsWith('/offers/offer-1/pdf')) {
        return new Response(new Blob(['pdf-bytes']), { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      }
      return null;
    });
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    renderModal();

    await userEvent.type(screen.getByLabelText('Compensation'), '$120,000/yr');
    fillTerms();

    await userEvent.click(screen.getByRole('button', { name: 'Preview PDF' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith('blob:mock', '_blank', 'noopener,noreferrer'));
    const createCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/pipeline/entries/entry-1/offers') && call[1]?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall![1]?.body))).toMatchObject({ compensation: '$120,000/yr' });
    const pdfCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/offers/offer-1/pdf'));
    expect(pdfCall).toBeDefined();

    openSpy.mockRestore();
  });

  it('Send creates the draft offer then sends it and closes', async () => {
    const fetchMock = mockFetch((url, options) => {
      if (url.endsWith('/pipeline/entries/entry-1/offers') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'offer-1', status: 'draft' }), { status: 201 });
      }
      if (url.endsWith('/offers/offer-1/send') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'offer-1', status: 'sent' }), { status: 200 });
      }
      return null;
    });
    const onClose = jest.fn();
    renderModal(onClose);

    await userEvent.type(screen.getByLabelText('Compensation'), '$120,000/yr');
    fillTerms();

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/pipeline/entries/entry-1/offers') && call[1]?.method === 'POST'),
    ).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/offers/offer-1/send') && call[1]?.method === 'POST')).toBe(
      true,
    );
  });
});
