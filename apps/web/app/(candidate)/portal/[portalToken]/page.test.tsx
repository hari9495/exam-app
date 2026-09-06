import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import PortalPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const PORTAL = {
  candidateName: 'Asha Rao',
  candidateEmail: 'asha@example.com',
  candidatePhone: '555-1234',
  resume: { hasResume: false, parseStatus: null },
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

  it('renders the details form prefilled and email disabled', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify(PORTAL), { status: 200 })) as unknown as typeof fetch;

    render(<PortalPage />);

    expect(await screen.findByLabelText('Name')).toHaveValue('Asha Rao');
    expect(screen.getByLabelText('Phone')).toHaveValue('555-1234');
    expect(screen.getByLabelText('Email')).toHaveValue('asha@example.com');
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });

  it('saves the details form via PATCH with name+phone (never email) and updates the view', async () => {
    const updated = { ...PORTAL, candidateName: 'Asha R.', candidatePhone: '555-9999' };
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'PATCH' && urlString.endsWith('/public/portal/ptok-1/profile')) {
        const body = JSON.parse(options.body as string);
        expect(body).toEqual({ name: 'Asha R.', phone: '555-9999' });
        return new Response(JSON.stringify(updated), { status: 200 });
      }
      return new Response(JSON.stringify(PORTAL), { status: 200 });
    }) as unknown as typeof fetch;

    render(<PortalPage />);
    await screen.findByLabelText('Name');

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Asha R.');
    await userEvent.clear(screen.getByLabelText('Phone'));
    await userEvent.type(screen.getByLabelText('Phone'), '555-9999');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Asha R.');
  });

  it('shows the résumé state and uploads a valid PDF', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/portal/ptok-1/resume')) {
        const body = JSON.parse(options.body as string);
        expect(body.resumeBase64).toBeTruthy();
        expect(body.resumeBase64).not.toContain('data:');
        return new Response(JSON.stringify({ ...PORTAL, resume: { hasResume: true, parseStatus: 'pending' } }), { status: 200 });
      }
      return new Response(JSON.stringify(PORTAL), { status: 200 });
    }) as unknown as typeof fetch;

    render(<PortalPage />);
    expect(await screen.findByText('No résumé uploaded')).toBeInTheDocument();

    const file = new File([new Uint8Array([1, 2, 3])], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/résumé/i), file);

    expect(await screen.findByText(/Résumé on file/)).toBeInTheDocument();
  });
});
