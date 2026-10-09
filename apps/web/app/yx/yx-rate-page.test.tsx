import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useParams, useSearchParams } from 'next/navigation';
import RateLinkPage from './rate/[org]/[token]/page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ API_BASE: '/api/v1' }));

// Founder decision 8 Oct 2026: opening an emailed rating link records nothing (email link scanners open links and the
// link works once). The score in the link is only pre-chosen; "Confirm my rating" sends it.
const calls: { url: string; method: string; body?: string }[] = [];
beforeEach(() => {
  calls.length = 0;
  (useParams as jest.Mock).mockReturnValue({ org: 'o1', token: 't'.repeat(32) });
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('score=4'));
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if ((init?.method ?? 'GET') === 'GET') return new Response(JSON.stringify({ kind: 'csat', company: 'Kaveri Foods', question: 'How did we do?', min: 1, max: 5, used: false }), { status: 200 });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});

it('shows the score from the link but sends nothing until the person confirms', async () => {
  render(<RateLinkPage />);
  const confirm = await screen.findByRole('button', { name: 'Confirm my rating' });
  expect(screen.getByRole('radio', { name: '4' })).toHaveAttribute('aria-checked', 'true');
  // Give any stray effect a moment: still only the GET.
  await new Promise((r) => setTimeout(r, 20));
  expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

  fireEvent.click(screen.getByRole('radio', { name: '2' }));
  fireEvent.click(confirm);
  await screen.findByText(/We saved your answer \(2\)/);
  const posts = calls.filter((c) => c.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0].body!)).toEqual({ score: 2 });
});

it('without a score in the link, the confirm button waits for a choice', async () => {
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  render(<RateLinkPage />);
  expect(await screen.findByRole('button', { name: 'Confirm my rating' })).toBeDisabled();
  await waitFor(() => expect(calls).toHaveLength(1));
});
