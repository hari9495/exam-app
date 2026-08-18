import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import InterviewPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const SINGLE_SLOT_INTERVIEW = {
  jobTitle: 'Senior Backend Engineer',
  orgName: 'Acme Corp',
  slots: [{ id: 'slot-1', startsAt: '2099-01-15T15:00:00.000Z', endsAt: '2099-01-15T16:00:00.000Z' }],
  location: 'Zoom',
  timeZone: 'UTC',
  panel: ['Jane', 'Sam'],
  status: 'proposed',
  confirmedSlotId: null,
};

const MULTI_SLOT_INTERVIEW = {
  ...SINGLE_SLOT_INTERVIEW,
  slots: [
    { id: 'slot-1', startsAt: '2099-01-15T15:00:00.000Z', endsAt: '2099-01-15T16:00:00.000Z' },
    { id: 'slot-2', startsAt: '2099-01-16T15:00:00.000Z', endsAt: '2099-01-16T16:00:00.000Z' },
  ],
};

function mockFetch(interview: unknown, overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  global.fetch = jest.fn(async (url, options) => {
    const urlString = String(url);
    const override = overrides(urlString, options);
    if (override) return override;
    if (urlString.endsWith('/public/interviews/tok-abc')) {
      return new Response(JSON.stringify(interview), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as unknown as typeof fetch;
}

describe('InterviewPage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ token: 'tok-abc' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the interview details and action buttons for a single slot', async () => {
    mockFetch(SINGLE_SLOT_INTERVIEW);
    render(<InterviewPage />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Zoom')).toBeInTheDocument();
    expect(screen.getByText(/Jane, Sam/)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /^Confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Decline/i })).toBeInTheDocument();
  });

  it('single-slot confirm POSTs {action: "confirm", slotId} and swaps to a confirmation state', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/interviews/tok-abc/respond')) {
        return new Response(JSON.stringify({ status: 'confirmed' }), { status: 200 });
      }
      if (urlString.endsWith('/public/interviews/tok-abc')) {
        return new Response(JSON.stringify(SINGLE_SLOT_INTERVIEW), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<InterviewPage />);
    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Confirm/i }));

    expect(await screen.findByRole('heading', { name: /Interview confirmed/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline/i })).not.toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(String(postCall![0])).toBe('http://localhost:3001/api/v1/public/interviews/tok-abc/respond');
    expect(JSON.parse(postCall![1].body)).toEqual({ action: 'confirm', slotId: 'slot-1' });
  });

  it('multi-slot: picking a slot then confirming POSTs the selected slotId', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/interviews/tok-abc/respond')) {
        return new Response(JSON.stringify({ status: 'confirmed' }), { status: 200 });
      }
      if (urlString.endsWith('/public/interviews/tok-abc')) {
        return new Response(JSON.stringify(MULTI_SLOT_INTERVIEW), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<InterviewPage />);
    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    // Confirm is disabled until a slot is picked (more than one candidate slot).
    expect(screen.getByRole('button', { name: /^Confirm/i })).toBeDisabled();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    await userEvent.click(radios[1]);

    await userEvent.click(screen.getByRole('button', { name: /^Confirm/i }));

    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(JSON.parse(postCall![1].body)).toEqual({ action: 'confirm', slotId: 'slot-2' });
  });

  it('decline POSTs {action: "decline"}', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/interviews/tok-abc/respond')) {
        return new Response(JSON.stringify({ status: 'declined' }), { status: 200 });
      }
      if (urlString.endsWith('/public/interviews/tok-abc')) {
        return new Response(JSON.stringify(SINGLE_SLOT_INTERVIEW), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<InterviewPage />);
    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Decline/i }));

    expect(await screen.findByRole('heading', { name: /Interview declined/i })).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(postCall![1].body)).toEqual({ action: 'decline' });
  });

  it('reschedule with a note POSTs {action: "reschedule", note}', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/interviews/tok-abc/respond')) {
        return new Response(JSON.stringify({ status: 'reschedule_requested' }), { status: 200 });
      }
      if (urlString.endsWith('/public/interviews/tok-abc')) {
        return new Response(JSON.stringify(SINGLE_SLOT_INTERVIEW), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<InterviewPage />);
    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Request reschedule/i }));
    await userEvent.type(screen.getByLabelText(/what times would work better/i), 'Mornings only please');
    await userEvent.click(screen.getByRole('button', { name: /Send request/i }));

    expect(await screen.findByText(/reschedule requested/i)).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(postCall![1].body)).toEqual({ action: 'reschedule', note: 'Mornings only please' });
  });

  it('renders a closed state with no buttons when the interview is already confirmed', async () => {
    mockFetch({ ...SINGLE_SLOT_INTERVIEW, status: 'confirmed', confirmedSlotId: 'slot-1' });
    render(<InterviewPage />);

    expect(await screen.findByText(/confirmed/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline/i })).not.toBeInTheDocument();
  });

  it('renders a closed state with no buttons when the interview was cancelled', async () => {
    mockFetch({ ...SINGLE_SLOT_INTERVIEW, status: 'cancelled' });
    render(<InterviewPage />);

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Confirm/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Decline/i })).not.toBeInTheDocument();
  });

  it('shows a generic closed state on a 404/409 fetch', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 404 })) as unknown as typeof fetch;
    render(<InterviewPage />);

    expect(await screen.findByText(/no longer available/i)).toBeInTheDocument();
  });
});
