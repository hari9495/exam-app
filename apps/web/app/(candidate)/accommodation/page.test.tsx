import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@yukthix/ui';
import { useRouter } from 'next/navigation';
import { useAskForHelp, useAttemptQuery, useCandidateHelp } from '../../../lib/hooks/useAttempt';
import CandidateAccommodationPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));
jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn(), useCandidateHelp: jest.fn(), useAskForHelp: jest.fn() }));

// AS-4b (answer 2011, PRC-23): the candidate's request page.
const preview = { data: { candidateName: 'Asha', exam: { title: 'Java L2', durationMinutes: 60 }, sections: [] }, isLoading: false, isError: false, refetch: jest.fn() };

beforeEach(() => {
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  (useAttemptQuery as jest.Mock).mockReturnValue(preview);
  (useCandidateHelp as jest.Mock).mockReturnValue({ data: { request: null, approved: [], extraTimePercent: 0 }, isLoading: false, isError: false, refetch: jest.fn() });
});

it('sends what the candidate chose, with the extra time', async () => {
  const send = jest.fn().mockResolvedValue({});
  (useAskForHelp as jest.Mock).mockReturnValue({ mutateAsync: send });
  render(<ToastProvider><CandidateAccommodationPage /></ToastProvider>);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Extra time' }));
  expect(screen.getByText('Your 60-minute test would become 75 minutes')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
  expect(send).toHaveBeenCalledWith({ kinds: ['time'], extraTimePercent: 25, note: null, evidence: null });
});

it('negative: a refusal from the server is shown and the form stays', async () => {
  (useAskForHelp as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockRejectedValue(new Error('Your earlier request is still being decided. You will hear back before your test.')) });
  render(<ToastProvider><CandidateAccommodationPage /></ToastProvider>);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Screen-reader mode' }));
  await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
  expect(await screen.findByText('Your earlier request is still being decided. You will hear back before your test.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send request' })).toBeInTheDocument();
});
