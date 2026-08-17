import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupDrivesPage from './page';
import { QueryProvider } from '../../../../../lib/query-provider';
import { ToastProvider } from '../../../../../components/ui';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useParams: () => ({ groupId: 'group-1' }),
}));
jest.mock('../../../../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org' }) }));

const GROUPS = [{ id: 'group-1', name: 'Fresher Drive Hackathon', createdAt: '2026-08-01T00:00:00.000Z', exams: [] }];

const DRIVES = [
  {
    id: 'drive-live',
    organizationId: 'org-1',
    walkInGroupId: 'group-1',
    name: 'Morning Session',
    startsAt: '2026-08-17T04:00:00.000Z',
    endsAt: '2026-08-17T10:00:00.000Z',
    createdAt: '2026-08-10T00:00:00.000Z',
    status: 'live',
  },
  {
    id: 'drive-ended',
    organizationId: 'org-1',
    walkInGroupId: 'group-1',
    name: 'Last Week',
    startsAt: '2026-08-01T04:00:00.000Z',
    endsAt: '2026-08-01T10:00:00.000Z',
    createdAt: '2026-07-25T00:00:00.000Z',
    status: 'ended',
  },
  {
    id: 'drive-scheduled',
    organizationId: 'org-1',
    walkInGroupId: 'group-1',
    name: 'Next Week',
    startsAt: '2026-08-24T04:00:00.000Z',
    endsAt: '2026-08-24T10:00:00.000Z',
    createdAt: '2026-08-10T00:00:00.000Z',
    status: 'scheduled',
  },
];

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <GroupDrivesPage />
      </ToastProvider>
    </QueryProvider>,
  );
}

function mockFetch(overrides: (url: string, options?: RequestInit) => Response | null = () => null) {
  const fetchMock = jest.fn(async (url, options) => {
    const urlStr = String(url);
    const override = overrides(urlStr, options);
    if (override) return override;
    if (urlStr.endsWith('/walk-in-groups')) {
      return new Response(JSON.stringify(GROUPS), { status: 200 });
    }
    if (urlStr.endsWith('/walk-in-groups/group-1/drives')) {
      return new Response(JSON.stringify(DRIVES), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('GroupDrivesPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists the group\'s drives with their derived status badge', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByText('Morning Session')).toBeInTheDocument();
    expect(screen.getByText('Last Week')).toBeInTheDocument();
    expect(screen.getByText('Next Week')).toBeInTheDocument();

    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('links each drive to its drive surface', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: 'Morning Session' });
    expect(link).toHaveAttribute('href', '/drives/drive-live');
  });

  it('schedules a new drive with the entered name/start/end', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/walk-in-groups/group-1/drives') && options?.method === 'POST'
        ? new Response(
            JSON.stringify({
              id: 'drive-new',
              organizationId: 'org-1',
              walkInGroupId: 'group-1',
              name: 'Backend Roles',
              startsAt: '2026-09-01T09:00:00.000Z',
              endsAt: '2026-09-01T17:00:00.000Z',
              createdAt: '2026-08-17T00:00:00.000Z',
              status: 'scheduled',
            }),
            { status: 201 },
          )
        : null,
    );
    renderPage();
    await screen.findByText('Morning Session');

    await userEvent.type(screen.getByLabelText('Drive Name'), 'Backend Roles');
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-09-01T09:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-09-01T17:00' } });

    await userEvent.click(screen.getByRole('button', { name: /schedule drive/i }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith('/walk-in-groups/group-1/drives') && call[1]?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall![1]?.body));
      expect(body.name).toBe('Backend Roles');
      expect(new Date(body.endsAt).getTime()).toBeGreaterThan(new Date(body.startsAt).getTime());
    });
    expect(await screen.findByText('Drive scheduled.')).toBeInTheDocument();
  });

  it('disables submit when the end time is not after the start time', async () => {
    mockFetch();
    renderPage();
    await screen.findByText('Morning Session');

    await userEvent.type(screen.getByLabelText('Drive Name'), 'Bad Window');
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-09-01T17:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-09-01T09:00' } });

    expect(screen.getByText('End must be after start.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /schedule drive/i })).toBeDisabled();
  });

  it('surfaces a backend validation error (e.g. an overlapping window) instead of swallowing it', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/walk-in-groups/group-1/drives') && options?.method === 'POST'
        ? new Response(JSON.stringify({ message: 'This group already has a drive scheduled in that window' }), { status: 400 })
        : null,
    );
    renderPage();
    await screen.findByText('Morning Session');

    await userEvent.type(screen.getByLabelText('Drive Name'), 'Overlap');
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-09-01T09:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '2026-09-01T17:00' } });
    await userEvent.click(screen.getByRole('button', { name: /schedule drive/i }));

    expect(await screen.findByText('This group already has a drive scheduled in that window')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });
});
