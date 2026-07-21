import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';
import WalkInPage from './page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'demo-org' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('../../../lib/hooks/useWalkIn', () => ({ useWalkInExams: jest.fn(), useWalkInRegister: jest.fn() }));

describe('WalkInPage', () => {
  beforeEach(() => {
    (useWalkInRegister as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it('shows the no-exams message and no form when zero exams are open for walk-in', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<WalkInPage />);

    expect(screen.getByText('No exams are currently open for walk-in registration.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('shows an error message when the exam list fails to load', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<WalkInPage />);

    expect(screen.getByRole('alert')).toHaveTextContent("isn't available right now");
  });

  it('shows the form without an exam picker when exactly one exam is open', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60 }],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exam' })).not.toBeInTheDocument();
  });

  it('shows the form with an exam picker listing every exam when two or more are open', async () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60 },
        { id: 'exam-2', title: 'Frontend Round', durationMinutes: 45 },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    const combobox = screen.getByRole('combobox', { name: 'Exam' });
    await userEvent.click(combobox);

    expect(screen.getByRole('option', { name: 'Backend Round' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Frontend Round' })).toBeInTheDocument();
  });
});
