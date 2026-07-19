import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useExamInvitations, useUpdateAccommodation } from '../lib/hooks/useInvitations';
import { CandidatesPanel } from './CandidatesPanel';

jest.mock('../lib/hooks/useInvitations', () => ({ useExamInvitations: jest.fn(), useUpdateAccommodation: jest.fn() }));

describe('CandidatesPanel', () => {
  it('shows an editable extra-time control for a candidate who has not started', async () => {
    const mutate = jest.fn();
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate, isPending: false });

    render(<CandidatesPanel examId="exam-1" />);

    const input = screen.getByRole('spinbutton', { name: /extra time.*alice/i });
    await userEvent.clear(input);
    await userEvent.type(input, '50');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mutate).toHaveBeenCalledWith({ invitationId: 'inv-1', extraTimePercent: 50 });
  });

  it('shows the extra time as read-only once an attempt exists', () => {
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 50, attempt: { id: 'attempt-1' }, candidate: { id: 'cand-1', name: 'Bob', email: 'bob@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    render(<CandidatesPanel examId="exam-1" />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /extra time.*bob/i })).not.toBeInTheDocument();
  });
});
