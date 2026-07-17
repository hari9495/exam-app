import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from './ProctoringOverlay';

describe('ProctoringWarningOverlay', () => {
  it('shows the strike count and calls onContinue', async () => {
    const onContinue = jest.fn();
    render(<ProctoringWarningOverlay strike={1} onContinue={onContinue} continuePending={false} continueError={false} />);

    expect(screen.getByText(/warning 1\/3/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('shows a retry hint when continue previously failed', () => {
    render(<ProctoringWarningOverlay strike={2} onContinue={jest.fn()} continuePending={false} continueError />);
    expect(screen.getByText(/still not detected/i)).toBeInTheDocument();
  });

  it('disables the continue button while pending', () => {
    render(<ProctoringWarningOverlay strike={1} onContinue={jest.fn()} continuePending continueError={false} />);
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled();
  });
});

describe('ProctoringBlockOverlay', () => {
  it('shows the recruiter-unblock message with no continue action', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('reassures the candidate the timer is paused and shows a waiting/polling status', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/waiting for a recruiter/i)).toBeInTheDocument();
    expect(screen.getByText(/timer is paused/i)).toBeInTheDocument();
  });
});
