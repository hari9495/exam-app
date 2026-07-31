import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useExamInvitations, useUpdateAccommodation } from '../lib/hooks/useInvitations';
import { ToastProvider } from './ui';
import { CandidatesPanel } from './CandidatesPanel';

jest.mock('../lib/hooks/useInvitations', () => ({ useExamInvitations: jest.fn(), useUpdateAccommodation: jest.fn() }));
jest.mock('./InviteCandidatesModal', () => ({
  InviteCandidatesModal: ({ existingCandidateIds }: { existingCandidateIds: string[] }) => (
    <div data-testid="invite-modal">{JSON.stringify(existingCandidateIds)}</div>
  ),
}));

function renderPanel(examId = 'exam-1') {
  render(
    <ToastProvider>
      <CandidatesPanel examId={examId} />
    </ToastProvider>,
  );
}

describe('CandidatesPanel', () => {
  it('shows an editable extra-time control for a candidate who has not started', async () => {
    const mutate = jest.fn();
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate, isPending: false });

    renderPanel();

    const input = screen.getByRole('spinbutton', { name: /extra time.*alice/i });
    await userEvent.clear(input);
    await userEvent.type(input, '50');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mutate).toHaveBeenCalledWith(
      { invitationId: 'inv-1', extraTimePercent: 50 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('shows an error toast when saving extra time fails', async () => {
    const mutate = jest.fn((_input, options) => options.onError(new Error('Extra time must be between 0 and 300.')));
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate, isPending: false });

    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Extra time must be between 0 and 300.')).toBeInTheDocument();
  });

  it('shows a visible % unit next to the editable extra-time input', () => {
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    renderPanel();

    expect(screen.getByText('%')).toBeInTheDocument();
  });

  it('shows the extra time as read-only once an attempt exists', () => {
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 50, attempt: { id: 'attempt-1', status: 'in_progress' }, candidate: { id: 'cand-1', name: 'Bob', email: 'bob@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    renderPanel();

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /extra time.*bob/i })).not.toBeInTheDocument();
  });

  it("shows the candidate's progress as Invited, In Progress, or Ended based on invitation/attempt status", () => {
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [
        { id: 'inv-1', status: 'invited', extraTimePercent: 0, attempt: null, candidate: { id: 'cand-1', name: 'Alice', email: 'a@example.com' } },
        { id: 'inv-2', status: 'invited', extraTimePercent: 0, attempt: { id: 'att-2', status: 'in_progress' }, candidate: { id: 'cand-2', name: 'Bob', email: 'b@example.com' } },
        { id: 'inv-3', status: 'invited', extraTimePercent: 0, attempt: { id: 'att-3', status: 'submitted' }, candidate: { id: 'cand-3', name: 'Cara', email: 'c@example.com' } },
      ],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    renderPanel();

    expect(screen.getByText('Invited')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
  });

  it('opens the invite-candidates modal, passing the already-invited candidate ids to exclude', async () => {
    (useExamInvitations as jest.Mock).mockReturnValue({
      data: [{ id: 'inv-1', extraTimePercent: 0, attempt: null, candidateId: 'cand-1', candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' } }],
      isLoading: false,
    });
    (useUpdateAccommodation as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });

    renderPanel();

    expect(screen.queryByTestId('invite-modal')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Invite candidates' }));

    expect(screen.getByTestId('invite-modal')).toHaveTextContent('["cand-1"]');
  });
});
