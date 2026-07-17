import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ token: 'raw-test-token' }),
  useRouter: () => ({ push: mockPush }),
}));

describe('ResetPasswordPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('keeps submit disabled until the two password fields match', async () => {
    render(<ResetPasswordPage />);

    const submit = screen.getByRole('button', { name: 'Reset password' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    expect(submit).not.toBeDisabled();
  });

  it('submits the token and new password, then shows a success message', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/reset-password'));
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      token: 'raw-test-token',
      newPassword: 'NewPassw0rd!',
    });

    await waitFor(() => expect(screen.getByText(/password has been reset/i)).toBeInTheDocument());
  });

  it('shows an invalid/expired error and a link to request a new one when the reset fails', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ message: 'This reset link is invalid or has expired' }), { status: 400 }),
    ) as unknown as typeof fetch;

    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is invalid or has expired');
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/forgot-password');
  });
});
