import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateLinkScreen } from './candidate-link';

describe('CandidateLinkScreen (invitation link and session ended, decision 2398)', () => {
  it('checking: a labelled spinner while the invitation is verified', () => {
    render(<CandidateLinkScreen live={{ state: 'checking' }} />);
    expect(screen.getByRole('status', { name: 'Checking your invitation' })).toBeTruthy();
  });

  it('failed with retry: the reason and a Retry button that tries again', () => {
    const onRetry = vi.fn();
    render(<CandidateLinkScreen live={{ state: 'failed', message: 'We could not reach YukthiX.', onRetry }} />);
    expect(screen.getByRole('alert').textContent).toContain('We could not reach YukthiX.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('failed for good (link used or expired): no button that cannot work', () => {
    render(<CandidateLinkScreen live={{ state: 'failed', message: 'This invitation link has already been used.' }} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("We can't open this invitation");
    expect(within(alert).queryByRole('button')).toBeNull();
  });

  it('ended: says why and what to do; never names a company it does not know', () => {
    const { container } = render(<CandidateLinkScreen live={{ state: 'ended' }} />);
    expect(screen.getByText('Your session has ended')).toBeTruthy();
    expect(screen.getByText(/use the link in your invitation email again/)).toBeTruthy();
    expect(container.textContent).not.toContain('Arjun');
  });
});
