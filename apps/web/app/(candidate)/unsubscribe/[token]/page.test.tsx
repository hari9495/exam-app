import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'next/navigation';
import UnsubscribePage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

describe('UnsubscribePage', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ token: 'tok-abc' });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the org name and current subscribed state, with an Unsubscribe button', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ optedOut: false, orgName: 'Acme Corp' }), { status: 200 })) as unknown as typeof fetch;

    render(<UnsubscribePage />);

    expect(await screen.findByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText(/subscribed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unsubscribe/i })).toBeInTheDocument();
  });

  it('clicking Unsubscribe POSTs optedOut:true and reflects the new state', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/unsubscribe/tok-abc')) {
        const body = JSON.parse(options.body as string);
        expect(body).toEqual({ optedOut: true });
        return new Response(JSON.stringify({ optedOut: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ optedOut: false, orgName: 'Acme Corp' }), { status: 200 });
    }) as unknown as typeof fetch;

    render(<UnsubscribePage />);
    await screen.findByText('Acme Corp');

    await userEvent.click(screen.getByRole('button', { name: /unsubscribe/i }));

    expect(await screen.findByText(/unsubscribed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-subscribe/i })).toBeInTheDocument();
  });

  it('clicking Re-subscribe POSTs optedOut:false and reflects the new state', async () => {
    global.fetch = jest.fn(async (url, options) => {
      const urlString = String(url);
      if (options?.method === 'POST' && urlString.endsWith('/public/unsubscribe/tok-abc')) {
        const body = JSON.parse(options.body as string);
        expect(body).toEqual({ optedOut: false });
        return new Response(JSON.stringify({ optedOut: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ optedOut: true, orgName: 'Acme Corp' }), { status: 200 });
    }) as unknown as typeof fetch;

    render(<UnsubscribePage />);
    await screen.findByText('Acme Corp');

    await userEvent.click(screen.getByRole('button', { name: /re-subscribe/i }));

    expect(await screen.findByRole('button', { name: /unsubscribe/i })).toBeInTheDocument();
  });

  it('shows an invalid-link state for an unknown token', async () => {
    global.fetch = jest.fn(async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;

    render(<UnsubscribePage />);

    expect(await screen.findByText(/isn't valid/i)).toBeInTheDocument();
  });
});
