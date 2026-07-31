import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from './page';
import { QueryProvider } from '../../lib/query-provider';

describe('ForgotPasswordPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('submits organization slug and email, then shows the generic success message', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/forgot-password')) {
        return new Response(JSON.stringify({ message: 'If an account exists...' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ForgotPasswordPage />
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/forgot-password'));
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      organizationSlug: 'demo-org',
      email: 'recruiter@demo-org.test',
    });

    await waitFor(() =>
      expect(screen.getByText(/we've sent a reset link/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login');
  });

  it('shows an error banner when the request fails', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 })) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ForgotPasswordPage />
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please wait a minute and try again.');
  });
});
