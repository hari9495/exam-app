import { render, screen } from '@testing-library/react';
import { ApprovalTimeline } from './ApprovalTimeline';

it('renders a row per step with state tones', () => {
  render(<ApprovalTimeline steps={[{ name: 'HM', state: 'approved' }, { name: 'Finance', state: 'pending' }]} currentStep={1} />);
  expect(screen.getByText('HM')).toBeInTheDocument();
  expect(screen.getByText('Finance')).toBeInTheDocument();
  expect(screen.getByTestId('approval-step-0')).toHaveAttribute('data-state', 'approved');
  expect(screen.getByTestId('approval-step-1')).toHaveAttribute('data-state', 'pending');
});
