import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { candidateApiFetch } from '../../../lib/candidate-api-client';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidatePrivacyPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), usePathname: jest.fn(), useSearchParams: jest.fn(), useParams: jest.fn() }));
jest.mock('../../../lib/candidate-api-client', () => ({ candidateApiFetch: jest.fn(), setCandidateUnauthorizedHandler: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({ useCandidateBrand: jest.fn(() => undefined) }));

// AS-5 part 3 (PRC-28): the candidate's privacy centre, live.
const api = candidateApiFetch as jest.Mock;
const push = jest.fn();
const VIEW = {
  company: 'Kaveri Foods',
  consents: [{ what: 'Camera, screen and activity monitoring', test: 'Java Backend Developer · L2', at: '2026-11-17T05:00:00.000Z' }],
  recordings: { frames: 3, deleteOn: '2026-12-17T05:00:00.000Z' },
  face: { kept: false, deleteOn: null },
  held: false,
  request: null,
};
const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CandidatePrivacyPage />
    </QueryClientProvider>,
  );

beforeEach(() => {
  api.mockReset();
  push.mockReset();
  (useRouter as jest.Mock).mockReturnValue({ push });
  (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: 'ct', isLoading: false });
  api.mockImplementation(async (path: string) => {
    if (path === '/attempt/privacy') return VIEW;
    if (path === '/attempt/privacy/erase') return { ...VIEW, request: { status: 'waiting', requestedAt: '2026-11-17T06:00:00.000Z', doneAt: null, dueOn: '2026-12-17T06:00:00.000Z' } };
    return {};
  });
});

it('shows what is kept until when and records an erasure request', async () => {
  wrap();
  expect(await screen.findByText('Delete on 17 Dec 2026')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Erase my recordings and face data' }));
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Erase my data' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/attempt/privacy/erase', expect.objectContaining({ method: 'POST' }), 'ct'));
  expect(await screen.findByText('Erasure request received on 17 Nov 2026')).toBeInTheDocument();
});

it('negative: without a candidate session it goes to the session-ended page', () => {
  (useCandidateAuth as jest.Mock).mockReturnValue({ accessToken: null, isLoading: false });
  wrap();
  expect(push).toHaveBeenCalledWith('/session-ended');
  expect(api).not.toHaveBeenCalled();
});
