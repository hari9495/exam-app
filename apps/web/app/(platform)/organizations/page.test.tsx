import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganizationsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import { Organization } from '../../../lib/types';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const ORGS: Organization[] = [
  {
    id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    primaryAdminName: 'Ada', primaryAdminEmail: 'ada@acme.test', userCount: 12, examCount: 8,
  },
  {
    id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', status: 'active',
    createdAt: '2026-01-02T00:00:00.000Z',
    // Creation stores only the email, so a fresh org has no admin name yet.
    primaryAdminName: null, primaryAdminEmail: 'admin@beta.test', userCount: 0, examCount: 0,
  },
];

function renderPage(orgs: Organization[] = ORGS) {
  localStorage.clear();
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  const actingToken = fakeJwt({ sub: 'u1', organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme' });
  global.fetch = jest.fn(async (url: unknown, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/auth/super-admin/switch-into/org-1') && options?.method === 'POST') {
      return new Response(JSON.stringify({ accessToken: actingToken }), { status: 200 });
    }
    if (String(url).includes('/organizations') && options?.method === undefined) {
      return new Response(
        JSON.stringify({ data: orgs, total: orgs.length, page: 1, pageSize: 200, totalPages: 1 }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <ToastProvider>
        <AuthProvider>
          <OrganizationsPage />
        </AuthProvider>
      </ToastProvider>
    </QueryProvider>,
  );
}

// Table marks sortable <th> with role="button", so columnheader queries do not
// match. Scope to the table when asserting on columns or cells.
function inTable() {
  return within(screen.getByRole('table'));
}

describe('OrganizationsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('renders organizations as table rows with admin and counts', async () => {
    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(inTable().getByText('ada@acme.test')).toBeInTheDocument();
    expect(inTable().getByText('Ada')).toBeInTheDocument();
    expect(inTable().getByText('12')).toBeInTheDocument();
  });

  it('renders an em dash when the primary admin has no name yet', async () => {
    renderPage();

    await screen.findByText('Beta');
    expect(inTable().getByText('admin@beta.test')).toBeInTheDocument();
    expect(inTable().getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows the item count', async () => {
    renderPage();
    await screen.findByText('Acme');
    expect(screen.getByTestId('list-view-meta')).toHaveTextContent('2 items');
  });

  it('hides the exam count column by default and reveals it from the chooser', async () => {
    renderPage();
    await screen.findByText('Acme');

    expect(inTable().queryByText('Exams')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Choose columns' }));
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Exams' }));
    await userEvent.keyboard('{Escape}');

    expect(inTable().getByText('Exams')).toBeInTheDocument();
  });

  it('does not show the create form until New is pressed', async () => {
    renderPage();
    await screen.findByText('Acme');

    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(await screen.findByLabelText('Slug')).toBeInTheDocument();
  });

  it('switches into an organization from the row menu', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Switch into' }));

    await waitFor(() => {
      const call = (global.fetch as jest.Mock).mock.calls.find(([u]) =>
        String(u).endsWith('/auth/super-admin/switch-into/org-1'),
      );
      expect(call).toBeDefined();
    });
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('opens the edit modal prefilled from the row that was chosen', async () => {
    renderPage();
    await screen.findByText('Beta');

    // Deliberately the SECOND row: a modal that seeds once on mount would show
    // the first row's values here.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Beta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    expect(await screen.findByLabelText('Name')).toHaveValue('Beta');
    // Scope to the dialog: "beta" is also the Slug cell in the table behind it.
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('beta')).toBeInTheDocument();
    expect(dialog.getByText(/slug cannot be changed/i)).toBeInTheDocument();
  });

  it('shows a status badge per row', async () => {
    renderPage();
    await screen.findByText('Acme');
    expect(inTable().getAllByText('Active')).toHaveLength(2);
  });

  it('suspends an organization from the row menu', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

    await waitFor(() => {
      const patch = (global.fetch as jest.Mock).mock.calls.find(
        ([u, o]) => o?.method === 'PATCH' && String(u).includes('/status'),
      );
      expect(patch).toBeDefined();
      expect(String(patch[0])).toContain('/organizations/org-1/status');
      expect(JSON.parse(patch[1].body)).toEqual({ status: 'suspended' });
    });
  });

  it('offers Reactivate, not Suspend, for an already-suspended organization', async () => {
    renderPage([{ ...ORGS[0], status: 'suspended' as const }]);
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));

    expect(await screen.findByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Suspend' })).not.toBeInTheDocument();
  });

  it('suspends the row whose menu was used, not the first row', async () => {
    // The action closes over `org`; a stale closure here would suspend the
    // wrong organization, which is exactly the kind of bug nobody notices.
    renderPage();
    await screen.findByText('Beta');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Beta' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

    await waitFor(() => {
      const patch = (global.fetch as jest.Mock).mock.calls.find(
        ([u, o]) => o?.method === 'PATCH' && String(u).includes('/status'),
      );
      expect(patch).toBeDefined();
      expect(String(patch[0])).toContain('/organizations/org-2/status');
    });
  });

  it('links View users to the all-users tab filtered by organization name', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'View users' }));

    // Directory rows carry organizationName, not a slug, so the filter must be
    // the name or it would match nothing.
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/all-users?org=Acme'));
  });

  it('filters the table by the search box', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.type(screen.getByRole('searchbox'), 'beta');

    expect(inTable().getByText('Beta')).toBeInTheDocument();
    expect(inTable().queryByText('Acme')).not.toBeInTheDocument();
  });

  it('searches by admin email too, not just name and slug', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.type(screen.getByRole('searchbox'), 'ada@');

    expect(inTable().getByText('Acme')).toBeInTheDocument();
    expect(inTable().queryByText('Beta')).not.toBeInTheDocument();
  });

  it('sorts across the whole list, not just the first 20 rows', async () => {
    // The old page size was 20. Sorting a paginated slice would put the first
    // row of page one on top instead of the global first -- the exact bug that
    // fetching everything removes.
    const many: Organization[] = Array.from({ length: 45 }, (_, i) => ({
      ...ORGS[0],
      id: `org-${i}`,
      name: `Org ${String(45 - i).padStart(2, '0')}`,
      slug: `org-${i}`,
    }));
    renderPage(many);
    await screen.findByText('Org 45');

    await userEvent.click(screen.getByText('Name'));

    const firstDataRow = screen.getAllByRole('row')[1];
    expect(within(firstDataRow).getByText('Org 01')).toBeInTheDocument();
  });
});
