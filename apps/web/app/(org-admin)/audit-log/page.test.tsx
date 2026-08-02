import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const ENTRY_1 = {
  id: 'log-1', action: 'user.created', entityType: 'user', entityId: 'user-2',
  actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', metadata: null, createdAt: '2026-07-14T10:00:00.000Z',
};
const ENTRY_2 = {
  id: 'log-2', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
  actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', metadata: null, createdAt: '2026-07-13T10:00:00.000Z',
};

describe('AuditLogPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists audit entries and applies an action filter', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/audit-logs') && urlStr.includes('action=user.created')) {
        return new Response(JSON.stringify([ENTRY_1]), { status: 200 });
      }
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify([ENTRY_1, ENTRY_2]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

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

    await userEvent.type(screen.getByLabelText('Action'), 'user.created');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(screen.queryByText('Candidate data erased (GDPR)')).not.toBeInTheDocument());
    expect(screen.getByText('Staff user created')).toBeInTheDocument();

    const filteredCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('action=user.created'));
    expect(filteredCall).toBeDefined();
  });

  it('shows error state when the audit log fails to load', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/audit-logs')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

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

  it('appends entries when clicking "Load more" with cursor-based pagination', async () => {
    const fetchMock = jest.fn(async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (urlStr.includes('/audit-logs') && urlStr.includes('cursor=log-1')) {
        return new Response(JSON.stringify([ENTRY_2]), { status: 200 });
      }
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify([ENTRY_1]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    // Wait for first entry to appear
    await waitFor(() => expect(screen.getByText('Staff user created')).toBeInTheDocument());
    expect(screen.queryByText('Candidate data erased (GDPR)')).not.toBeInTheDocument();

    // Click "Load more"
    const loadMoreBtn = screen.getByRole('button', { name: 'Load more' });
    await userEvent.click(loadMoreBtn);

    // Wait for second entry to appear
    await waitFor(() => expect(screen.getByText('Candidate data erased (GDPR)')).toBeInTheDocument());

    // Assert both entries are now visible (proving append, not replace)
    expect(screen.getByText('Staff user created')).toBeInTheDocument();
    expect(screen.getByText('Candidate data erased (GDPR)')).toBeInTheDocument();

    // Assert the second fetch includes cursor=log-1
    const paginationCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('cursor=log-1'));
    expect(paginationCall).toBeDefined();
  });

  it('renders the action column as a tone-mapped StatusBadge', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/audit-logs')) {
        return new Response(JSON.stringify([ENTRY_1, ENTRY_2]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

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

  it('exports loaded entries to CSV when Export CSV is clicked', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/audit-logs')) {
        return new Response(JSON.stringify([ENTRY_1]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    // jsdom has no real Blob URL / download; stub the bits the handler touches.
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

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('opens a detail view showing the raw action key, entity id, and metadata', async () => {
    const entryWithMeta = {
      id: 'log-3', action: 'invitation.created', entityType: 'invitation', entityId: 'inv-1',
      actorUserId: 'user-1', actorEmail: 'admin@demo-org.test',
      metadata: { count: 2, examTitle: 'Backend Round' }, createdAt: '2026-07-14T10:00:00.000Z',
    };
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/audit-logs')) {
        return new Response(JSON.stringify([entryWithMeta]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

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
});
