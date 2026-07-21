import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateButton } from './CandidateButton';

describe('CandidateButton', () => {
  it('renders children and responds to clicks', async () => {
    const onClick = jest.fn();
    render(<CandidateButton onClick={onClick}>Start exam</CandidateButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Start exam' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the secondary variant class', () => {
    render(<CandidateButton variant="secondary">Previous</CandidateButton>);
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveClass('border-candidate-primary');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<CandidateButton disabled>Next</CandidateButton>);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('uses the contrast-safe on-primary text color for the primary variant', () => {
    render(<CandidateButton variant="primary">Continue</CandidateButton>);
    expect(screen.getByRole('button')).toHaveClass('text-candidate-on-primary');
    expect(screen.getByRole('button')).not.toHaveClass('text-white');
  });
});
