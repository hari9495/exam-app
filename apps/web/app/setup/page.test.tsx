import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetupPage from './page';
import * as apiClient from '../../lib/api-client';

jest.mock('../../lib/api-client');
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('SetupPage', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockedApiFetch.mockReset();
  });

  it('redirects to /login when setup is already complete', async () => {
    mockedApiFetch.mockResolvedValueOnce({ needsSetup: false });
    render(<SetupPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
  });

  it('shows the form when setup is needed, and submits token/email/password', async () => {
    mockedApiFetch.mockResolvedValueOnce({ needsSetup: true });
    render(<SetupPage />);

    const tokenInput = await screen.findByLabelText('Setup Token');
    fireEvent.change(tokenInput, { target: { value: 'raw-token-value' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@test.local' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SetupVerify123!' } });

    mockedApiFetch.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Complete setup' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/setup/complete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'raw-token-value', email: 'ops@test.local', password: 'SetupVerify123!' }),
        }),
      ),
    );
  });

  it('shows an error message when completion fails', async () => {
    mockedApiFetch.mockResolvedValueOnce({ needsSetup: true });
    render(<SetupPage />);

    await screen.findByLabelText('Setup Token');
    fireEvent.change(screen.getByLabelText('Setup Token'), { target: { value: 'wrong-token' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@test.local' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SetupVerify123!' } });

    mockedApiFetch.mockRejectedValueOnce(new Error('This setup token is invalid or has expired'));
    fireEvent.click(screen.getByRole('button', { name: 'Complete setup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This setup token is invalid or has expired');
  });
});
