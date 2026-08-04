import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const ENTRY_1 = {
  id: 'log-1', action: 'user.created', entityType: 'user', entityId: 'user-2', entityName: null,
  actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', actorName: null, actorRole: null,
  metadata: null, createdAt: '2026-07-14T10:00:00.000Z',
};
const ENTRY_2 = {
  id: 'log-2', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1', entityName: null,
  actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', actorName: null, actorRole: null,
  metadata: null, createdAt: '2026-07-13T10:00:00.000Z',
};

// AuditActorFilter always fires a `useUsers` search query; every fetch mock in
// this file needs to answer /users or the actor-picker's query rejects.
function withUsersStub(handler: (url: string) => Response | Promise<Response> | null): typeof fetch {
  return jest.fn(async (url) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
    }
    if (urlStr.includes('/users')) {
      return new Response(JSON.stringify({ data: [], page: 1, pageSize: 10, total: 0 }), { status: 200 });
    }
    const result = await handler(urlStr);
    if (result) return result;
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('AuditLogPage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists audit entries and applies an action filter', async () => {
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs') && urlStr.includes('action=user.created')) {
        return new Response(JSON.stringify({ data: [ENTRY_1], total: 1 }), { status: 200 });
      }
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ data: [ENTRY_1, ENTRY_2], total: 2 }), { status: 200 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    // Actions render as human-readable labels, not raw "<entity>.<verb>" keys.
    await waitFor(() => expect(screen.getByText('Candidate data erased (GDPR)')).toBeInTheDocument());
    expect(screen.getByText('Staff user created')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 events')).toBeInTheDocument();

    // Action filtering lives in the Action column header, not a toolbar combobox.
    await userEvent.click(screen.getByRole('button', { name: 'Filter by Action' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Staff user created/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(screen.queryByText('Candidate data erased (GDPR)')).not.toBeInTheDocument());
    expect(screen.getByText('Staff user created')).toBeInTheDocument();

    const fetchMock = global.fetch as jest.Mock;
    const filteredCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('action=user.created'));
    expect(filteredCall).toBeDefined();
  });

  it('shows error state when the audit log fails to load', async () => {
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load audit log.')).toBeInTheDocument();
  });

  it('appends entries when clicking "Load more" with cursor-based pagination, hiding the button once everything is loaded', async () => {
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs') && urlStr.includes('cursor=log-1')) {
        return new Response(JSON.stringify({ data: [ENTRY_2], total: 2 }), { status: 200 });
      }
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ data: [ENTRY_1], total: 2 }), { status: 200 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Staff user created')).toBeInTheDocument());
    expect(screen.getByText('Showing 1 of 2 events')).toBeInTheDocument();
    expect(screen.queryByText('Candidate data erased (GDPR)')).not.toBeInTheDocument();

    const loadMoreBtn = screen.getByRole('button', { name: 'Load more' });
    await userEvent.click(loadMoreBtn);

    await waitFor(() => expect(screen.getByText('Candidate data erased (GDPR)')).toBeInTheDocument());
    expect(screen.getByText('Staff user created')).toBeInTheDocument();
    // Both loaded, total reached -- "Load more" disappears rather than offering a no-op click.
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    const fetchMock = global.fetch as jest.Mock;
    const paginationCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('cursor=log-1'));
    expect(paginationCall).toBeDefined();
  });

  it('renders the action column as a tone-mapped StatusBadge', async () => {
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ data: [ENTRY_1, ENTRY_2], total: 2 }), { status: 200 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Staff user created')).toBeInTheDocument());
    const createdBadge = screen.getByText('Staff user created');
    expect(createdBadge.className).toContain('bg-status-success-bg');
    const erasedBadge = screen.getByText('Candidate data erased (GDPR)');
    expect(erasedBadge.className).toContain('bg-status-danger-bg');
  });

  it('exports every matching row from the server (not just what is loaded) when Export CSV is clicked', async () => {
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs/export')) {
        return new Response(new Blob(['who,what\na,b']), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="audit-log.csv"' },
        });
      }
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ data: [ENTRY_1], total: 1 }), { status: 200 });
      }
      return null;
    });

    const createObjectURL = jest.fn(() => 'blob:audit');
    const revokeObjectURL = jest.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revokeObjectURL;
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Staff user created')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(clickSpy).toHaveBeenCalled();
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/audit-logs/export'))).toBe(true);
    clickSpy.mockRestore();
  });

  it('opens a detail view showing the raw action key, entity id, and metadata', async () => {
    const entryWithMeta = {
      id: 'log-3', action: 'invitation.created', entityType: 'invitation', entityId: 'inv-1', entityName: null,
      actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', actorName: null, actorRole: null,
      metadata: { count: 2, examTitle: 'Backend Round' }, createdAt: '2026-07-14T10:00:00.000Z',
    };
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ data: [entryWithMeta], total: 1 }), { status: 200 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    // Metadata specifics show inline in the Details column (label not repeated there).
    await waitFor(() => expect(screen.getByText(/“Backend Round”/)).toBeInTheDocument());
    expect(screen.getByText(/2 records/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View' }));

    // Detail modal exposes the raw action key, the full entity id, and the metadata.
    expect(screen.getByText('invitation.created')).toBeInTheDocument();
    expect(screen.getByText('inv-1')).toBeInTheDocument();
    expect(screen.getByText(/"examTitle": "Backend Round"/)).toBeInTheDocument();
  });

  it('preseeds the entity filter from ?entityType&entityId&entityName and shows a clearable "Filtered by" chip', async () => {
    mockSearchParams = new URLSearchParams({ entityType: 'exam', entityId: 'exam-1', entityName: 'Backend Round' });
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs') && urlStr.includes('entityId=exam-1')) {
        return new Response(JSON.stringify({ data: [ENTRY_1], total: 1 }), { status: 200 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Staff user created')).toBeInTheDocument());
    const chip = screen.getByText(/Filtered by:/);
    expect(within(chip.closest('p')!).getByText('Backend Round')).toBeInTheDocument();

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('entityId=exam-1'))).toBe(true);
  });

  it('toggles between all/change/access events via the category control', async () => {
    global.fetch = withUsersStub((urlStr) => {
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify({ data: [ENTRY_1], total: 1 }), { status: 200 });
      }
      return null;
    });

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Staff user created')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Changes' }));

    const fetchMock = global.fetch as jest.Mock;
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('category=change'))).toBe(true),
    );
  });
});
