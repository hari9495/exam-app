import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CareersJobList } from './CareersJobList';
import { CareersJob } from '../../../lib/types';

const JOBS: CareersJob[] = [
  {
    applyToken: 'tok-1',
    title: 'Senior Backend Engineer',
    location: 'Remote',
    employmentType: 'full_time',
    department: 'Engineering',
    salaryMin: 90000,
    salaryMax: 120000,
    salaryCurrency: 'USD',
  },
  {
    applyToken: 'tok-2',
    title: 'Account Executive',
    location: 'New York',
    employmentType: 'full_time',
    department: 'Sales',
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
  },
];

describe('CareersJobList', () => {
  it('renders a card per job, linking to the apply page', () => {
    render(<CareersJobList jobs={JOBS} />);

    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText('Account Executive')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Senior Backend Engineer/ })).toHaveAttribute('href', '/apply/tok-1');
    expect(screen.getByRole('link', { name: /Account Executive/ })).toHaveAttribute('href', '/apply/tok-2');
  });

  it('narrows the list with the department filter', async () => {
    render(<CareersJobList jobs={JOBS} />);

    await userEvent.selectOptions(screen.getByLabelText('Filter by department'), 'Engineering');

    expect(screen.getByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Account Executive')).not.toBeInTheDocument();
  });

  it('narrows the list with the location filter', async () => {
    render(<CareersJobList jobs={JOBS} />);

    await userEvent.selectOptions(screen.getByLabelText('Filter by location'), 'New York');

    expect(screen.queryByText('Senior Backend Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Account Executive')).toBeInTheDocument();
  });

  it('shows the empty state when there are no jobs', () => {
    render(<CareersJobList jobs={[]} />);

    expect(screen.getByText('No open roles right now')).toBeInTheDocument();
  });

  it('shows the empty state when filters match nothing', async () => {
    render(<CareersJobList jobs={JOBS} />);

    await userEvent.selectOptions(screen.getByLabelText('Filter by department'), 'Engineering');
    await userEvent.selectOptions(screen.getByLabelText('Filter by location'), 'New York');

    expect(screen.getByText('No open roles right now')).toBeInTheDocument();
  });
});
