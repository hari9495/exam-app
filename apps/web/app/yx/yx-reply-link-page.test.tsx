import { fireEvent, render, screen } from '@testing-library/react';
import { useParams } from 'next/navigation';
import ReplyLinkPage from './m/[token]/page';

jest.mock('next/navigation', () => ({ useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: '/api/v1' }));

// Founder decision 9 Oct 2026: an SMS carries only a link to read a reply. Opening the page (a phone's link preview)
// reads nothing; "Read the reply" shows it once.
const calls: { url: string; method: string }[] = [];
let postStatus = 200;
beforeEach(() => {
  calls.length = 0;
  postStatus = 200;
  (useParams as jest.Mock).mockReturnValue({ token: 'A'.repeat(22) });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ number: 'IT-42' }), { status: 200 });
    if (postStatus !== 200) return new Response('{}', { status: postStatus });
    return new Response(JSON.stringify({ number: 'IT-42', agentName: 'Farah', text: 'A new cartridge is on its way.', signIn: '/yx/desk/help/t1' }), { status: 200 });
  }) as unknown as typeof fetch;
});

it('opening the link reads nothing; pressing the button shows the reply', async () => {
  render(<ReplyLinkPage />);
  const button = await screen.findByRole('button', { name: 'Read the reply' });
  expect(screen.getByRole('heading', { name: 'You have a reply on IT-42' })).toBeInTheDocument();
  await new Promise((r) => setTimeout(r, 20));
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  fireEvent.click(button);
  expect(await screen.findByText('A new cartridge is on its way.')).toBeInTheDocument();
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  expect(calls[0].url).toBe(`/api/v1/desk/reply-link/${'A'.repeat(22)}`);
});

it('a used or expired link says so', async () => {
  postStatus = 410;
  render(<ReplyLinkPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Read the reply' }));
  expect(await screen.findByText('This link was used or has expired')).toBeInTheDocument();
});
