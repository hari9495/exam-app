import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersDirectoryPage from './page';
import * as authContext from '../../../lib/auth-context';
import * as userDirectoryHook from '../../../lib/hooks/useUserDirectory';

jest.mock('../../../lib/auth-context');
jest.mock('../../../lib/hooks/useUserDirectory');

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const useAuth = authContext.useAuth as jest.Mock;
const useUserDirectory = userDirectoryHook.useUserDirectory as jest.Mock;

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

    await userEvent.click(screen.getByRole('button', { name: /manage/i }));

    expect(switchIntoOrg).toHaveBeenCalledWith('org-1');
    expect(mockPush).toHaveBeenCalledWith('/users');
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
