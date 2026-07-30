import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersDirectoryPage from './page';
import * as authContext from '../../../lib/auth-context';
import * as userDirectoryHook from '../../../lib/hooks/useUserDirectory';

jest.mock('../../../lib/auth-context');
jest.mock('../../../lib/hooks/useUserDirectory');

const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

const useAuth = authContext.useAuth as jest.Mock;
const useUserDirectory = userDirectoryHook.useUserDirectory as jest.Mock;

beforeEach(() => { mockSearchParams = new URLSearchParams(); localStorage.clear(); });

describe('UsersDirectoryPage', () => {
  afterEach(() => {
    mockPush.mockClear();
    jest.clearAllMocks();
  });

  it('lists users with their organization name and switches into an org via Manage', async () => {
    const switchIntoOrg = jest.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ accessToken: 'token', switchIntoOrg });
    useUserDirectory.mockReturnValue({
      data: {
        data: [
          {
            id: 'u1',
            organizationId: 'org-1',
            organizationName: 'Acme Inc',
            email: 'a@acme.test',
            name: 'A',
            role: 'recruiter',
            status: 'active',
            lastLoginAt: null,
            createdAt: '2026-01-01',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<UsersDirectoryPage />);

    expect(await screen.findByText('a@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Acme Inc')).toBeInTheDocument();

    // Manage now lives in the per-row action menu rather than as a bare button.
    await userEvent.click(screen.getByRole('button', { name: 'Actions for a@acme.test' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Manage' }));

    await waitFor(() => expect(switchIntoOrg).toHaveBeenCalledWith('org-1'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/users'));
  });

  it('renders each row with its own organization, not a single echoed value', async () => {
    useAuth.mockReturnValue({ accessToken: 'token', switchIntoOrg: jest.fn() });
    useUserDirectory.mockReturnValue({
      data: {
        data: [
          {
            id: 'u1',
            organizationId: 'org-1',
            organizationName: 'Acme Inc',
            email: 'a@acme.test',
            name: 'A',
            role: 'recruiter',
            status: 'active',
            lastLoginAt: null,
            createdAt: '2026-01-01',
          },
          {
            id: 'u2',
            organizationId: 'org-2',
            organizationName: 'Widget Co',
            email: 'b@widget.test',
            name: 'B',
            role: 'org_admin',
            status: 'active',
            lastLoginAt: null,
            createdAt: '2026-01-01',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<UsersDirectoryPage />);

    expect(await screen.findByText('a@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Acme Inc')).toBeInTheDocument();
    expect(screen.getByText('b@widget.test')).toBeInTheDocument();
    expect(screen.getByText('Widget Co')).toBeInTheDocument();
  });

  it('shows an empty-state message when the directory has no users', async () => {
    useAuth.mockReturnValue({ accessToken: 'token', switchIntoOrg: jest.fn() });
    useUserDirectory.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
      isLoading: false,
      isError: false,
    });

    render(<UsersDirectoryPage />);

    expect(await screen.findByText(/no users found/i)).toBeInTheDocument();
  });

  it('shows a platform dash instead of an org name for other super_admin rows', async () => {
    useAuth.mockReturnValue({ accessToken: 'token', switchIntoOrg: jest.fn() });
    useUserDirectory.mockReturnValue({
      data: {
        data: [
          {
            id: 'u2',
            organizationId: null,
            organizationName: null,
            email: 'super@platform.test',
            name: 'Super',
            role: 'super_admin',
            status: 'active',
            lastLoginAt: null,
            createdAt: '2026-01-01',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<UsersDirectoryPage />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });
});
