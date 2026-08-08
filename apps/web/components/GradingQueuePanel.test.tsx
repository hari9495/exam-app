import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { GradingQueuePanel } from './GradingQueuePanel';

jest.mock('../lib/hooks/useCodeGrading', () => ({
  usePendingGrading: jest.fn(),
  useGradeCodeAnswer: jest.fn(),
  useFinalizeManualGrade: jest.fn(),
  useCodeReview: jest.fn(),
  useRegenerateCodeReview: jest.fn(),
}));

function renderPanel() {
  return render(
    <ToastProvider>
      <GradingQueuePanel examId="exam-1" />
    </ToastProvider>,
  );
}

const pendingRow = {
  attemptId: 'a1',
  candidateId: 'c1',
  candidateName: 'Alice',
  codeQuestions: [
    { questionId: 'q1', questionText: 'Reverse a string', difficulty: 'hard', starterCode: null, codeLanguage: 'python', answerText: 'def reverse(s): return s[::-1]', marks: 10, marksAwarded: null, gradingFeedback: null },
  ],
};

describe('GradingQueuePanel', () => {
  const gradeMutateAsync = jest.fn().mockResolvedValue({});
  const finalizeMutateAsync = jest.fn().mockResolvedValue({ status: 'submitted' });
  const regenerateMutateAsync = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    gradeMutateAsync.mockClear();
    finalizeMutateAsync.mockClear();
    (usePendingGrading as jest.Mock).mockReturnValue({ data: [pendingRow], isLoading: false });
    (useGradeCodeAnswer as jest.Mock).mockReturnValue({ mutateAsync: gradeMutateAsync, isPending: false });
    (useFinalizeManualGrade as jest.Mock).mockReturnValue({ mutateAsync: finalizeMutateAsync, isPending: false });
    (useCodeReview as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    (useRegenerateCodeReview as jest.Mock).mockReturnValue({ mutateAsync: regenerateMutateAsync, isPending: false });
  });

  it('shows an empty state when there is nothing pending', () => {
    (usePendingGrading as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    renderPanel();
    expect(screen.getByText('No attempts pending manual grading.')).toBeInTheDocument();
  });

  // With a whole drive queued, every candidate's every code answer used to stack into one column,
  // so you could not see who was left without scrolling past everyone's submissions.
  describe('candidate accordion', () => {
    const secondRow = {
      attemptId: 'a2',
      candidateId: 'c2',
      candidateName: 'Bob',
      codeQuestions: [
        { questionId: 'q2', questionText: 'Sort a list', difficulty: 'easy', starterCode: null, codeLanguage: 'python', answerText: 'sorted(xs)', marks: 10, marksAwarded: 7, gradingFeedback: null },
        { questionId: 'q3', questionText: 'Sum a list', difficulty: 'medium', starterCode: null, codeLanguage: 'python', answerText: 'sum(xs)', marks: 10, marksAwarded: null, gradingFeedback: null },
      ],
    };

    it('collapses every candidate when more than one is queued, and expands the one you click', async () => {
      (usePendingGrading as jest.Mock).mockReturnValue({ data: [pendingRow, secondRow], isLoading: false });
      renderPanel();

      // Names are visible; the code behind them is not.
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.queryByText('def reverse(s): return s[::-1]')).not.toBeInTheDocument();
      expect(screen.queryByText('sorted(xs)')).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: /Alice/ }));

      expect(screen.getByText('def reverse(s): return s[::-1]')).toBeInTheDocument();
      // Opening one candidate must not open the rest.
      expect(screen.queryByText('sorted(xs)')).not.toBeInTheDocument();
    });

    it('shows grading progress on the collapsed header so you can see who is left without opening them', () => {
      (usePendingGrading as jest.Mock).mockReturnValue({ data: [pendingRow, secondRow], isLoading: false });
      renderPanel();

      expect(screen.getByText('0 of 1 graded')).toBeInTheDocument();
      expect(screen.getByText('1 of 2 graded')).toBeInTheDocument();
    });

    it('opens a lone pending candidate, since collapsing the only row is just an extra click', () => {
      renderPanel();
      expect(screen.getByText('def reverse(s): return s[::-1]')).toBeInTheDocument();
    });
  });

  it('lists the candidate and their submitted code', () => {
    renderPanel();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('def reverse(s): return s[::-1]')).toBeInTheDocument();
  });

  // A 3-mark hard question and a 3-mark easy one deserve different strictness, and the grader
  // had no way to tell them apart from inside the queue.
  it("shows the question's difficulty from the question bank", () => {
    renderPanel();
    expect(screen.getByText('hard')).toBeInTheDocument();
  });

  it('falls back to a neutral badge for a difficulty it does not recognise, rather than crashing', () => {
    (usePendingGrading as jest.Mock).mockReturnValue({
      data: [{ ...pendingRow, codeQuestions: [{ ...pendingRow.codeQuestions[0], difficulty: 'expert' }] }],
      isLoading: false,
    });
    renderPanel();
    expect(screen.getByText('expert')).toBeInTheDocument();
  });

  it('the Finalize grade button is disabled until every code question has a saved marksAwarded', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Finalize grade' })).toBeDisabled();
  });

  it('grading a question calls useGradeCodeAnswer with the entered marks', async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText('Marks For Reverse a string'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Save grade' }));
    expect(gradeMutateAsync).toHaveBeenCalledWith({ questionId: 'q1', marksAwarded: 8, feedback: undefined });
  });

  it('clicking Save grade with an empty marks field shows an error and does not save', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Save grade' }));
    expect(await screen.findByText('Marks must be between 0 and 10.')).toBeInTheDocument();
    expect(gradeMutateAsync).not.toHaveBeenCalled();
  });

  it('explicitly entering 0 marks still saves', async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText('Marks For Reverse a string'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save grade' }));
    expect(gradeMutateAsync).toHaveBeenCalledWith({ questionId: 'q1', marksAwarded: 0, feedback: undefined });
  });

  it('enables Finalize grade once every code question already has marksAwarded, and clicking it finalizes', async () => {
    (usePendingGrading as jest.Mock).mockReturnValue({
      data: [{ ...pendingRow, codeQuestions: [{ ...pendingRow.codeQuestions[0], marksAwarded: 8 }] }],
      isLoading: false,
    });
    renderPanel();

    const finalizeButton = screen.getByRole('button', { name: 'Finalize grade' });
    expect(finalizeButton).toBeEnabled();
    await userEvent.click(finalizeButton);
    expect(finalizeMutateAsync).toHaveBeenCalledWith('a1');
  });

  it('clicking Generate AI Review calls useRegenerateCodeReview', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Generate AI Review' }));
    expect(regenerateMutateAsync).toHaveBeenCalledWith({ attemptId: 'a1', questionId: 'q1' });
  });
});
