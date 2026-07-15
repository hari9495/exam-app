import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateReport, useAttemptInsight, useRegenerateAttemptInsight } from '../../../../../../lib/hooks/usePanelReports';
import PanelCandidateDetailPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../../../../lib/hooks/usePanelReports', () => ({
  useCandidateReport: jest.fn(),
  useAttemptInsight: jest.fn(),
  useRegenerateAttemptInsight: jest.fn(),
}));

const candidateDetail = {
  candidateId: 'c1',
  candidateName: 'Alice',
  status: 'submitted',
  score: 8,
  maxScore: 10,
  percentage: 80,
  passFail: 'pass',
  submittedAt: null,
  proctoringAnalysis: null,
  sections: [
    {
      sectionId: 's1',
      title: 'Section One',
      score: 8,
      maxScore: 10,
      questions: [
        {
          questionId: 'q1',
          questionText: 'What is 2 + 2?',
          type: 'single_mcq',
          marks: 5,
          negativeMarks: 0,
          options: [{ id: 'o1', text: '4' }, { id: 'o2', text: '5' }],
          selectedOptionIds: ['o1'],
          correctOptionIds: ['o1'],
          isCorrect: true,
          marksAwarded: 5,
        },
      ],
    },
  ],
};

describe('PanelCandidateDetailPage', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    mutateAsync.mockClear();
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1', candidateId: 'c1' });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('attemptId=a1'));
    (useCandidateReport as jest.Mock).mockReturnValue({ data: candidateDetail, isLoading: false });
    (useRegenerateAttemptInsight as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders the candidate score, pass/fail, and per-question breakdown', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it('shows a "Not yet generated" state with a Regenerate button when no insight exists', async () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Not yet generated')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(mutateAsync).toHaveBeenCalledWith('a1');
  });

  it('renders the insight summary when one exists', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({
      data: { id: 'ins-1', attemptId: 'a1', status: 'completed', summary: 'Strong performance overall.', generatedAt: '2026-01-01' },
      isLoading: false,
    });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Strong performance overall.')).toBeInTheDocument();
  });

  it('shows "Not yet generated" with a working Regenerate button when the insight row exists but has no summary yet (pending/failed)', async () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({
      data: { id: 'ins-1', attemptId: 'a1', status: 'failed', summary: null, generatedAt: '2026-01-01' },
      isLoading: false,
    });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Not yet generated')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(mutateAsync).toHaveBeenCalledWith('a1');
  });

  it('hides the AI Insight section entirely when the candidate has no attemptId (not yet attempted)', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    render(<PanelCandidateDetailPage />);

    expect(screen.queryByText('AI Insight')).not.toBeInTheDocument();
  });
});
