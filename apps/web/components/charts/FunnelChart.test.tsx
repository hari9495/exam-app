import { fireEvent, render, screen } from '@testing-library/react';
import { FunnelChart } from './FunnelChart';

describe('FunnelChart', () => {
  const stages = [
    { label: 'Invited', value: 100 },
    { label: 'Started', value: 60 },
    { label: 'Submitted', value: 55 },
    { label: 'Passed', value: 22 },
  ];

  it('renders one bar per stage labeled with its exact count', () => {
    render(<FunnelChart stages={stages} />);
    expect(screen.getByLabelText('Invited: 100')).toBeInTheDocument();
    expect(screen.getByLabelText('Started: 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Submitted: 55')).toBeInTheDocument();
    expect(screen.getByLabelText('Passed: 22')).toBeInTheDocument();
  });

  it('shows a tooltip with the exact count on hover', () => {
    render(<FunnelChart stages={stages} />);
    expect(screen.queryByText('Started: 60')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByLabelText('Started: 60'));
    expect(screen.getByText('Started: 60')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByLabelText('Started: 60'));
    expect(screen.queryByText('Started: 60')).not.toBeInTheDocument();
  });

  it('renders without crashing for empty stages', () => {
    const { container } = render(<FunnelChart stages={[]} />);
    expect(container.firstChild).toBeTruthy();
  });
});
