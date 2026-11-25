import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';
import CandidateStartPage from './page';

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../lib/candidate-auth-context', () => ({ useCandidateAuth: jest.fn() }));

describe('CandidateStartPage', () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ push });
  });

  it('redeems the token from the query string and redirects to /welcome', async () => {
    const redeem = jest.fn().mockResolvedValue(undefined);
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=abc123'));

    render(<CandidateStartPage />);

    await waitFor(() => expect(redeem).toHaveBeenCalledWith('abc123'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/welcome'));
  });

  it('shows an error when the token is missing', async () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem: jest.fn() });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));

    render(<CandidateStartPage />);

    expect(await screen.findByText(/missing a token/)).toBeInTheDocument();
  });

  it('shows the server error message when redeem fails', async () => {
    const redeem = jest.fn().mockRejectedValue(new Error('This invitation was revoked'));
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=abc123'));

    render(<CandidateStartPage />);

    expect(await screen.findByText('This invitation was revoked')).toBeInTheDocument();
  });

  it('a dropped connection offers Retry, which tries the same link again (kit screen, decision 2398)', async () => {
    const redeem = jest.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(undefined);
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=abc123'));

    render(<CandidateStartPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(redeem).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/welcome'));
  });

  it('a spent link offers no Retry (it cannot work)', async () => {
    (useCandidateAuth as jest.Mock).mockReturnValue({ redeem: jest.fn().mockRejectedValue(new Error('This invitation was revoked')) });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('token=abc123'));

    render(<CandidateStartPage />);

    expect(await screen.findByText("We can't open this invitation")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
