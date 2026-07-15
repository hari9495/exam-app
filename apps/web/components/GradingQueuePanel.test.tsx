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
    { questionId: 'q1', questionText: 'Reverse a string', starterCode: null, codeLanguage: 'python', answerText: 'def reverse(s): return s[::-1]', marks: 10, marksAwarded: null, gradingFeedback: null },
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

  it('lists the candidate and their submitted code', () => {
    renderPanel();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('def reverse(s): return s[::-1]')).toBeInTheDocument();
  });

  it('the Finalize grade button is disabled until every code question has a saved marksAwarded', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Finalize grade' })).toBeDisabled();
  });

  it('grading a question calls useGradeCodeAnswer with the entered marks', async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText('Marks for Reverse a string'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Save grade' }));
    expect(gradeMutateAsync).toHaveBeenCalledWith({ questionId: 'q1', marksAwarded: 8, feedback: undefined });
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
