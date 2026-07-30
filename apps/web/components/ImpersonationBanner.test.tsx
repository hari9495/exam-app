import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImpersonationBanner } from './ImpersonationBanner';

const mockStop = jest.fn();
const mockPush = jest.fn();
jest.mock('../lib/auth-context', () => ({
  useAuth: () => ({ impersonating: true, impersonatorEmail: 'admin@x.com', stopImpersonating: mockStop }),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { email: 'target@x.com' } }) }));

beforeEach(() => {
  mockStop.mockReset();
  mockStop.mockResolvedValue(null);
  mockPush.mockReset();
});

it('shows who you are logged in as and a return control', () => {
  render(<ImpersonationBanner />);
  expect(screen.getByText(/target@x.com/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /return to admin/i })).toBeInTheDocument();
});

it('navigates to the restored admin console after Return to admin, instead of bouncing to /login', async () => {
  // stopImpersonating restores the admin's own token and reports its role; a super_admin
  // returns to the platform organizations console.
  mockStop.mockResolvedValue('super_admin');
  render(<ImpersonationBanner />);
  await userEvent.click(screen.getByRole('button', { name: /return to admin/i }));
  expect(mockStop).toHaveBeenCalled();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/organizations'));
});
