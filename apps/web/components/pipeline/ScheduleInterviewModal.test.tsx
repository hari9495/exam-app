import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleInterviewModal } from './ScheduleInterviewModal';
import { QueryProvider } from '../../lib/query-provider';
import { ToastProvider } from '../ui';

jest.mock('../../lib/auth-context', () => ({
  useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org', role: 'recruiter' }),
}));

const STAFF = [
  { id: 'u1', organizationId: 'org-1', email: 'alice@x.com', name: 'Alice Panelist', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'u2', organizationId: 'org-1', email: 'bob@x.com', name: 'Bob Panelist', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
];

jest.mock('../../lib/hooks/useUsers', () => ({
  useUsers: () => ({ data: { data: STAFF, total: 2, page: 1, pageSize: 50, totalPages: 1 } }),
}));

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderModal(onClose = jest.fn()) {
  return render(
    <QueryProvider>
      <ToastProvider>
        <ScheduleInterviewModal entryId="entry-1" candidateId="cand-1" onClose={onClose} />
      </ToastProvider>
    </QueryProvider>,
  );
}

describe('ScheduleInterviewModal', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lets a slot row be added', async () => {
    mockFetch();
    renderModal();

    expect(screen.getByLabelText('Start 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start 2')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add slot' }));

    expect(screen.getByLabelText('Start 2')).toBeInTheDocument();
    expect(screen.getByLabelText('End 2')).toBeInTheDocument();
  });

  it('renders both mocked staff as panelist checkboxes', () => {
    mockFetch();
    renderModal();

    expect(screen.getByRole('checkbox', { name: 'Alice Panelist' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Bob Panelist' })).toBeInTheDocument();
  });

  it('Send creates the interview then sends it, with slots/panelistUserIds/timeZone/location', async () => {
    const fetchMock = mockFetch((url, options) => {
      if (url.endsWith('/pipeline/entries/entry-1/interviews') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'interview-1', status: 'proposed' }), { status: 201 });
      }
      if (url.endsWith('/interviews/interview-1/send') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'interview-1', status: 'proposed' }), { status: 200 });
      }
      return null;
    });
    const onClose = jest.fn();
    renderModal(onClose);

    fireEvent.change(screen.getByLabelText('Start 1'), { target: { value: '2026-09-01T10:00' } });
    fireEvent.change(screen.getByLabelText('End 1'), { target: { value: '2026-09-01T11:00' } });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Alice Panelist' }));

    await userEvent.click(screen.getByRole('combobox', { name: 'Time zone' }));
    await userEvent.click(screen.getByRole('option', { name: 'India (Asia/Kolkata)' }));

    await userEvent.type(screen.getByLabelText('Location'), 'Zoom link');

    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const createCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/pipeline/entries/entry-1/interviews') && call[1]?.method === 'POST',
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall![1]?.body))).toMatchObject({
      slots: [{ startsAt: new Date('2026-09-01T10:00').toISOString(), endsAt: new Date('2026-09-01T11:00').toISOString() }],
      panelistUserIds: ['u1'],
      timeZone: 'Asia/Kolkata',
      location: 'Zoom link',
    });

    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/interviews/interview-1/send') && call[1]?.method === 'POST'),
    ).toBe(true);
  });

  it('disables Send until a complete slot, a panelist, and a location are set', () => {
    mockFetch();
    renderModal();

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
