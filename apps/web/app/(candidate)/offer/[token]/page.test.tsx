import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import OfferPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const OFFER = {
  jobTitle: 'Senior Backend Engineer',
  orgName: 'Acme Corp',
  compensation: '$150,000/yr',
  startDate: '2026-09-01',
  expiresAt: '2099-01-01T00:00:00.000Z',
  status: 'sent',
  pdfUrl: 'http://localhost:3001/api/v1/offers/off-1/pdf',
};

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  global.fetch = jest.fn(async (url, options) => {
    const urlString = String(url);
    const override = overrides(urlString, options);
    if (override) return override;
    if (urlString.endsWith('/public/offers/tok-abc')) {
      return new Response(JSON.stringify(OFFER), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as unknown as typeof fetch;
}

describe('OfferPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ token: 'tok-abc' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the offer terms, a Download PDF link, and Accept/Decline buttons', async () => {
    mockFetch();
    render(<OfferPage />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/\$150,000\/yr/)).toBeInTheDocument();

    const pdfLink = screen.getByRole('link', { name: /Download PDF/i });
    expect(pdfLink).toHaveAttribute('href', OFFER.pdfUrl);
    expect(pdfLink).toHaveAttribute('target', '_blank');

    expect(screen.getByRole('button', { name: /Accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Decline/i })).toBeInTheDocument();
  });

  it('accepting POSTs {action: "accept"} and swaps to a confirmation state', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/offers/tok-abc/respond')) {
        return new Response(JSON.stringify({ status: 'accepted' }), { status: 200 });
      }
      if (urlString.endsWith('/public/offers/tok-abc')) {
        return new Response(JSON.stringify(OFFER), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<OfferPage />);
    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Accept/i }));

    expect(await screen.findByText(/accepted this offer/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline/i })).not.toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(String(postCall![0])).toBe('http://localhost:3001/api/v1/public/offers/tok-abc/respond');
    expect(JSON.parse(postCall![1].body)).toEqual({ action: 'accept' });
  });

  it('renders a closed state with no buttons when the offer was already accepted', async () => {
    mockFetch((url) =>
      url.endsWith('/public/offers/tok-abc') ? new Response(JSON.stringify({ ...OFFER, status: 'accepted' }), { status: 200 }) : null,
    );
    render(<OfferPage />);

    expect(await screen.findByText(/already responded/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Decline/i })).not.toBeInTheDocument();
  });

  it('renders a closed state with no buttons when the offer was withdrawn', async () => {
    mockFetch((url) =>
      url.endsWith('/public/offers/tok-abc') ? new Response(JSON.stringify({ ...OFFER, status: 'withdrawn' }), { status: 200 }) : null,
    );
    render(<OfferPage />);

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Decline/i })).not.toBeInTheDocument();
  });

  it('renders a closed state with no buttons when the offer has expired by date', async () => {
    mockFetch((url) =>
      url.endsWith('/public/offers/tok-abc')
        ? new Response(JSON.stringify({ ...OFFER, expiresAt: '2020-01-01T00:00:00.000Z' }), { status: 200 })
        : null,
    );
    render(<OfferPage />);

    expect(await screen.findByText(/expired/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Decline/i })).not.toBeInTheDocument();
  });

  it('shows a generic closed state on a 404/409 fetch', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 404 })) as unknown as typeof fetch;
    render(<OfferPage />);

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });
});
