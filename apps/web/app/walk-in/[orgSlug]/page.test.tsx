import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';
import WalkInPage from './page';

let mockSearchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useParams: () => ({ orgSlug: 'demo-org' }),
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => mockSearchParams,
}));
jest.mock('../../../lib/hooks/useWalkIn', () => ({ useWalkInExams: jest.fn(), useWalkInRegister: jest.fn() }));

describe('WalkInPage', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    (useWalkInRegister as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it('shows the no-exams message and no form when zero exams are open for walk-in', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({ data: [], isLoading: false, isError: false });

    render(<WalkInPage />);

    expect(screen.getByText('No exams are currently open for walk-in registration.')).toBeInTheDocument();
    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument();
  });

  it('shows an error message when the exam list fails to load', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<WalkInPage />);

    expect(screen.getByRole('alert')).toHaveTextContent("isn't available right now");
  });

  it('shows the form without an exam picker when exactly one exam is open', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true }],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exam' })).not.toBeInTheDocument();
  });

  it('collects First/Middle/Last Name (middle optional) and submits them composed into one name', async () => {
    const mutate = jest.fn();
    (useWalkInRegister as jest.Mock).mockReturnValue({ mutate, isPending: false });
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true }],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('First Name')).toBeRequired();
    expect(screen.getByLabelText('Middle Name')).not.toBeRequired();
    expect(screen.getByLabelText('Last Name')).toBeRequired();

    await userEvent.type(screen.getByLabelText('First Name'), 'Priya');
    await userEvent.type(screen.getByLabelText('Middle Name'), 'K');
    await userEvent.type(screen.getByLabelText('Last Name'), 'Sharma');
    await userEvent.type(screen.getByLabelText('Email'), 'priya@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me my exam link' }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Priya K Sharma', email: 'priya@example.com', examId: 'exam-1' }),
      expect.anything(),
    );
  });

  it('shows the form with an exam picker listing every exam when two or more are open', async () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true },
        { id: 'exam-2', title: 'Frontend Round', durationMinutes: 45, walkInListed: true },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    const combobox = screen.getByRole('combobox', { name: 'Exam' });
    await userEvent.click(combobox);

    expect(screen.getByRole('option', { name: 'Backend Round' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Frontend Round' })).toBeInTheDocument();
  });

  it('skips the exam picker when a shared link/QR code names one of the open exams via ?exam=', () => {
    mockSearchParams = new URLSearchParams('exam=exam-2');
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true },
        { id: 'exam-2', title: 'Frontend Round', durationMinutes: 45, walkInListed: true },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exam' })).not.toBeInTheDocument();
  });

  it('still shows the picker when ?exam= names an exam that is not actually open for walk-in', () => {
    mockSearchParams = new URLSearchParams('exam=not-a-real-exam');
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true },
        { id: 'exam-2', title: 'Frontend Round', durationMinutes: 45, walkInListed: true },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByRole('combobox', { name: 'Exam' })).toBeInTheDocument();
  });

  it('excludes a walkInListed=false exam from the shared picker', async () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true },
        { id: 'exam-2', title: 'Frontend Round', durationMinutes: 45, walkInListed: true },
        { id: 'exam-3', title: 'Internal Only', durationMinutes: 30, walkInListed: false },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    const combobox = screen.getByRole('combobox', { name: 'Exam' });
    await userEvent.click(combobox);

    expect(screen.getByRole('option', { name: 'Backend Round' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Frontend Round' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Internal Only' })).not.toBeInTheDocument();
  });

  it('still resolves and submits a walkInListed=false exam via its own ?exam= link', () => {
    mockSearchParams = new URLSearchParams('exam=exam-3');
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true },
        { id: 'exam-3', title: 'Internal Only', durationMinutes: 30, walkInListed: false },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exam' })).not.toBeInTheDocument();
  });

  it('auto-selects the sole listed exam even when an unlisted exam is also open, skipping the picker', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Round', durationMinutes: 60, walkInListed: true },
        { id: 'exam-3', title: 'Internal Only', durationMinutes: 30, walkInListed: false },
      ],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Exam' })).not.toBeInTheDocument();
  });

  it('shows the no-exams message when every open exam is unlisted and there is no ?exam= link', () => {
    (useWalkInExams as jest.Mock).mockReturnValue({
      data: [{ id: 'exam-3', title: 'Internal Only', durationMinutes: 30, walkInListed: false }],
      isLoading: false,
      isError: false,
    });

    render(<WalkInPage />);

    expect(screen.getByText('No exams are currently open for walk-in registration.')).toBeInTheDocument();
    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument();
  });
});
