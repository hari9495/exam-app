import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GetStartedPage from './page';

describe('GetStartedPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('submits the lead form to /leads and shows a confirmation', async () => {
    const fetchMock = jest.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify({ success: true }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<GetStartedPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Work email'), 'ada@acme.com');
    await userEvent.type(screen.getByLabelText('Company'), 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Request access' }));

    expect(await screen.findByText(/thanks/i)).toBeInTheDocument();
    expect(screen.getByText(/ada@acme\.com/)).toBeInTheDocument();

    const leadsCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/leads'));
    expect(leadsCall).toBeDefined();
    expect(JSON.parse((leadsCall![1] as RequestInit).body as string)).toEqual({
      name: 'Ada Lovelace',
      workEmail: 'ada@acme.com',
      company: 'Acme Corp',
      teamSize: '1-10',
      message: undefined,
    });
  });

  it('shows an error and keeps the form when the submission fails', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ message: 'Server error' }), { status: 500 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<GetStartedPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText('Work email'), 'ada@acme.com');
    await userEvent.type(screen.getByLabelText('Company'), 'Acme Corp');
    await userEvent.click(screen.getByRole('button', { name: 'Request access' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument();
  });
});
