import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useCalendarConnections, useDisconnectCalendar } from '../../../../lib/hooks/useCalendar';
import { apiFetch } from '../../../../lib/api-client';
import V2CalendarPage from './page';

jest.mock('../../../../lib/hooks/useCalendar', () => ({
  useCalendarConnections: jest.fn(),
  useDisconnectCalendar: jest.fn(),
}));
jest.mock('../../../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
jest.mock('../../../../lib/api-client', () => ({ apiFetch: jest.fn() }));

const searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));

describe('V2CalendarPage', () => {
  const disconnectMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    searchParams.forEach((_, k) => searchParams.delete(k));
    (useDisconnectCalendar as jest.Mock).mockReturnValue({ mutate: disconnectMutate, isPending: false });
  });

  it('shows Connect for a configured-but-unconnected provider and the account for a connected one', () => {
    (useCalendarConnections as jest.Mock).mockReturnValue({
      data: [
        { provider: 'google', label: 'Google Calendar', configured: true, connected: true, connectedEmail: 'me@gmail.com' },
        { provider: 'microsoft', label: 'Microsoft Outlook', configured: true, connected: false, connectedEmail: null },
      ],
      isLoading: false,
    });

    render(<V2CalendarPage />);

    expect(screen.getByText('me@gmail.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('disables Connect and explains when a provider is not configured on the deployment (inert in prod)', () => {
    (useCalendarConnections as jest.Mock).mockReturnValue({
      data: [{ provider: 'google', label: 'Google Calendar', configured: false, connected: false, connectedEmail: null }],
      isLoading: false,
    });

    render(<V2CalendarPage />);

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(screen.getByText('Not available on this workspace yet.')).toBeInTheDocument();
  });

  it('Connect fetches the auth url and redirects the browser to the provider', async () => {
    (useCalendarConnections as jest.Mock).mockReturnValue({
      data: [{ provider: 'google', label: 'Google Calendar', configured: true, connected: false, connectedEmail: null }],
      isLoading: false,
    });
    (apiFetch as jest.Mock).mockResolvedValue({ authUrl: 'https://consent.example/google' });
    const location = { href: '' };
    Object.defineProperty(window, 'location', { value: location, writable: true });

    render(<V2CalendarPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(window.location.href).toBe('https://consent.example/google'));
    expect(apiFetch).toHaveBeenCalledWith('/calendar/google/connect', {}, 'tok');
  });

  it('Disconnect fires the mutation for that provider', () => {
    (useCalendarConnections as jest.Mock).mockReturnValue({
      data: [{ provider: 'google', label: 'Google Calendar', configured: true, connected: true, connectedEmail: 'me@gmail.com' }],
      isLoading: false,
    });

    render(<V2CalendarPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnectMutate).toHaveBeenCalledWith('google');
  });

  it('shows a success banner after the OAuth callback returns ?calendarConnected', () => {
    searchParams.set('calendarConnected', 'google');
    (useCalendarConnections as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    render(<V2CalendarPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Calendar connected.');
  });
});
