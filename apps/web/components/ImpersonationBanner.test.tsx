import { render, screen } from '@testing-library/react';
import { ImpersonationBanner } from './ImpersonationBanner';

jest.mock('../lib/auth-context', () => ({
  useAuth: () => ({ impersonating: true, impersonatorEmail: 'admin@x.com', stopImpersonating: jest.fn() }),
}));
jest.mock('../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { email: 'target@x.com' } }) }));

it('shows who you are logged in as and a return control', () => {
  render(<ImpersonationBanner />);
  expect(screen.getByText(/target@x.com/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /return to admin/i })).toBeInTheDocument();
});
