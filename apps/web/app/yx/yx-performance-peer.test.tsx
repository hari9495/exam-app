import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import YxFeedbackTasksPage from './(app)/performance/feedback-tasks/page';
import YxPeerFormPage from './(app)/performance/feedback-tasks/[id]/page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../lib/api-client', () => ({ apiFetch: jest.fn() }));
jest.mock('../../lib/auth-context', () => ({ useAuth: jest.fn() }));

// Peer feedback wired to /performance (M06 batch PM5, PM-5.03).
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const api = apiFetch as jest.Mock;
function route(table: Record<string, unknown>) {
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${path.split('?')[0]}`;
    if (!(key in table)) throw new Error(`unexpected ${key}`);
    const value = table[key];
    return typeof value === 'function' ? value(path, init) : value;
  });
}
const push = jest.fn();

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push, replace: jest.fn() });
  (usePathname as jest.Mock).mockReturnValue('/yx/performance/feedback-tasks');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
  (useAuth as jest.Mock).mockReturnValue({ accessToken: 'tok', role: 'panel', actingSuperAdmin: false, isLoading: false, logout: jest.fn() });
});

describe('Peer feedback (M06 batch PM5)', () => {
  it('lists what I owe and opens the answer form', async () => {
    route({ 'GET /rbac/me/permissions': [], 'GET /performance/my-feedback-tasks': [{ id: 't1', reviewId: 'r1', employee: 'Arjun', cycle: 'FY', dueOn: '2026-10-25', done: false, open: true }] });
    wrap(<YxFeedbackTasksPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Answer' }));
    expect(push).toHaveBeenCalledWith('/yx/performance/feedback-tasks/r1');
  });

  it('sends the answer to the peer entry route', async () => {
    (useParams as jest.Mock).mockReturnValue({ id: 'r1' });
    const sent: unknown[] = [];
    const form = { reviewId: 'r1', employee: 'Arjun', cycle: 'FY', dueOn: '2026-10-25', anonymous: true, sections: [{ id: 'c', title: 'Competencies', questions: [{ id: 'c', text: 'Competencies', answer: 'both', required: false, maxChars: 2000, wholeSection: true }] }], levels: [{ value: 4, label: 'Exceeds' }], entry: null, can: { answer: true } };
    route({
      'GET /rbac/me/permissions': [],
      'GET /performance/reviews/r1/peer-form': form,
      'POST /performance/reviews/r1/entries/peer/submit': (_p: string, init: RequestInit) => (sent.push(JSON.parse(String(init.body))), form),
    });
    wrap(<YxPeerFormPage />);
    await userEvent.click(await screen.findByRole('radio', { name: '4 · Exceeds' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sent).toEqual([{ answers: [{ questionId: 'c', rating: 4, text: null }], comment: null }]));
  });
});
