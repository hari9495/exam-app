import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalkInGroupsPage from './page';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org' }) }));

const GROUPS = [
  {
    id: 'group-1',
    name: 'Fresher Drive Hackathon',
    createdAt: '2026-08-01T00:00:00.000Z',
    exams: [
      { id: 'exam-1', title: 'ServiceNow Fresher Drive Hackathon' },
      { id: 'exam-2', title: 'Salesforce Fresher Drive Hackathon' },
    ],
  },
];

function renderPage() {
  return render(
    <QueryProvider>
      <ToastProvider>
        <WalkInGroupsPage />
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
    if (urlStr.endsWith('/walk-in-groups/eligible-exams')) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('WalkInGroupsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists existing groups with their member exam titles', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByText('Fresher Drive Hackathon')).toBeInTheDocument();
    expect(screen.getByText('ServiceNow Fresher Drive Hackathon, Salesforce Fresher Drive Hackathon')).toBeInTheDocument();
  });

  it('shows an empty-state row when there are no groups yet', async () => {
    mockFetch((url) => (url.endsWith('/walk-in-groups') ? new Response(JSON.stringify([]), { status: 200 }) : null));
    renderPage();

    expect(await screen.findByText('No walk-in groups yet. Create one above.')).toBeInTheDocument();
  });

  it('creates a new group from the name field', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/walk-in-groups') && options?.method === 'POST'
        ? new Response(JSON.stringify({ id: 'group-2', name: 'Backend Roles', createdAt: '2026-08-05T00:00:00.000Z', exams: [] }), {
            status: 201,
          })
        : null,
    );
    renderPage();
    await screen.findByText('Fresher Drive Hackathon');

    await userEvent.type(screen.getByLabelText('New Group Name'), 'Backend Roles');
    await userEvent.click(screen.getByRole('button', { name: /new group/i }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/walk-in-groups') && call[1]?.method === 'POST');
      expect(createCall).toBeDefined();
      expect(JSON.parse(String(createCall![1]?.body))).toEqual({ name: 'Backend Roles' });
    });
    expect(await screen.findByText('Group created.')).toBeInTheDocument();
  });

  it('opens the manage modal prefilled with the group name and its own group link', async () => {
    mockFetch();
    renderPage();
    await screen.findByText('Fresher Drive Hackathon');

    await userEvent.click(screen.getByRole('button', { name: 'Manage' }));

    expect(screen.getByRole('heading', { name: 'Manage "Fresher Drive Hackathon"' })).toBeInTheDocument();
    expect(screen.getByLabelText('Group Name')).toHaveValue('Fresher Drive Hackathon');
    await waitFor(() => {
      expect(screen.getByText(/\/walk-in\/demo-org\?group=group-1/)).toBeInTheDocument();
    });
  });

  it('deletes a group after confirming, explaining its exams simply become ungrouped', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/walk-in-groups/group-1') && options?.method === 'DELETE'
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : null,
    );
    renderPage();
    await screen.findByText('Fresher Drive Hackathon');

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/will stay walk-in-enabled and simply become ungrouped/)).toBeInTheDocument();

    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith('/walk-in-groups/group-1') && call[1]?.method === 'DELETE',
      );
      expect(deleteCall).toBeDefined();
    });
  });
});
