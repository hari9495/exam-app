import { render, screen } from '@testing-library/react';
import { useParams } from 'next/navigation';
import PortalPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const PORTAL = {
  candidateName: 'Asha Rao',
  candidateEmail: 'asha@example.com',
  orgName: 'Acme',
  applications: [
    {
      jobTitle: 'Backend Engineer',
      stage: 'interview',
      rejected: false,
      appliedAt: '2026-08-01T00:00:00.000Z',
      statusToken: 'st1',
      interviews: [{ token: 'it1', status: 'proposed', location: 'Room 4', timeZone: 'UTC', confirmed: false, slots: [] }],
      offers: [{ token: 'ot1', status: 'sent', compensation: '10L', startDate: '2026-10-01T00:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z' }],
    },
  ],
};

describe('PortalPage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ portalToken: 'ptok-1' });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the candidate applications with Respond and View-offer links', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify(PORTAL), { status: 200 })) as unknown as typeof fetch;

    render(<PortalPage />);

    expect(await screen.findByText('Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Respond' })).toHaveAttribute('href', '/interview/it1');
    expect(screen.getByRole('link', { name: 'View offer' })).toHaveAttribute('href', '/offer/ot1');
  });

  it('shows an error card for an invalid portal token', async () => {
    global.fetch = jest.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;

    render(<PortalPage />);

    expect(await screen.findByText(/isn't valid/)).toBeInTheDocument();
  });
});
