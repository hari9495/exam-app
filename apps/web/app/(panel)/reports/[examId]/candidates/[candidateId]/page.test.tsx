import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams, useSearchParams } from 'next/navigation';
import {
  useCandidateReport,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsList,
} from '../../../../../../lib/hooks/usePanelReports';
import { ToastProvider } from '../../../../../../components/ui';
import PanelCandidateDetailPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../../../../lib/hooks/usePanelReports', () => ({
  useCandidateReport: jest.fn(),
  useAttemptInsight: jest.fn(),
  useRegenerateAttemptInsight: jest.fn(),
  useResultsList: jest.fn(),
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
  integrityAnalysis: null,
  webcamTimeline: [],
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

function renderPage() {
  render(
    <ToastProvider>
      <PanelCandidateDetailPage />
    </ToastProvider>,
  );
}

describe('PanelCandidateDetailPage', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    mutateAsync.mockClear();
    mutateAsync.mockResolvedValue(undefined);
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1', candidateId: 'c1' });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('attemptId=a1'));
    (useCandidateReport as jest.Mock).mockReturnValue({ data: candidateDetail, isLoading: false });
    (useRegenerateAttemptInsight as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useResultsList as jest.Mock).mockReturnValue({ data: [], isLoading: false });
  });

  it('renders the candidate score, pass/fail, and per-question breakdown', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    renderPage();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it('shows a "Not yet generated" state with a Regenerate button when no insight exists', async () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    renderPage();

    expect(screen.getByText('Not yet generated')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(mutateAsync).toHaveBeenCalledWith('a1');
  });

  it('renders the insight summary when one exists', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({
      data: { id: 'ins-1', attemptId: 'a1', status: 'completed', summary: 'Strong performance overall.', generatedAt: '2026-01-01' },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByText('Strong performance overall.')).toBeInTheDocument();
  });

  it('shows a distinct failure message with a Retry button when the last generation attempt failed', async () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({
      data: { id: 'ins-1', attemptId: 'a1', status: 'failed', summary: null, generatedAt: '2026-01-01' },
      isLoading: false,
    });
    renderPage();

    expect(screen.getByText('Generation failed. This is usually temporary — try again.')).toBeInTheDocument();
    expect(screen.queryByText('Not yet generated')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mutateAsync).toHaveBeenCalledWith('a1');
  });

  it('shows an error toast when regenerating throws', async () => {
    mutateAsync.mockRejectedValue(new Error('AI service unavailable'));
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(await screen.findByText('AI service unavailable')).toBeInTheDocument();
  });

  it('hides the AI Insight section entirely when the candidate has no attemptId (not yet attempted)', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    renderPage();

    expect(screen.queryByText('AI Insight')).not.toBeInTheDocument();
  });

  it('shows the gray placeholder integrity badge when there is no integrity analysis', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    renderPage();

    expect(screen.getByText('Integrity: —')).toBeInTheDocument();
  });

  it('shows the integrity badge, narrative, and one evidence item per flag', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    (useCandidateReport as jest.Mock).mockReturnValue({
      data: {
        ...candidateDetail,
        integrityAnalysis: {
          status: 'completed',
          level: 'high_concern',
          narrative: 'Multiple signals suggest this attempt warrants review.',
          flags: [
            { type: 'copy_paste', severity: 'medium', detail: 'Pasted content into the code editor.', questionId: 'q1' },
            { type: 'similarity_match', severity: 'high', detail: 'Answers closely match another candidate.', counterpartAttemptId: 'a2', similarity: 0.94 },
          ],
        },
      },
      isLoading: false,
    });
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'submitted', score: 6, maxScore: 10, percentage: 60, passFail: 'pass', submittedAt: null, proctoringAnalysis: null, integrityLevel: 'high_concern', integrityFlagCount: 1 },
      ],
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText('Integrity: High concern')).toBeInTheDocument();
    expect(screen.getByText('Multiple signals suggest this attempt warrants review.')).toBeInTheDocument();
    expect(screen.getByText('Pasted content into the code editor.')).toBeInTheDocument();
    expect(screen.getByText('Question: What is 2 + 2?')).toBeInTheDocument();
    expect(screen.getByText('Answers closely match another candidate.')).toBeInTheDocument();
    const counterpartLink = screen.getByRole('link', { name: /Bob/ });
    expect(counterpartLink).toHaveAttribute('href', '/reports/exam-1/candidates/c2?attemptId=a2');
  });

  describe('webcam timeline', () => {
    it('renders a tile per entry and opens the Modal with the enlarged image on click', async () => {
      (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
      (useCandidateReport as jest.Mock).mockReturnValue({
        data: {
          ...candidateDetail,
          webcamTimeline: [
            { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'multiple_faces', strike: 1, snapshot: 'data:image/png;base64,a' },
            { occurredAt: '2026-01-01T00:10:00.000Z', kind: 'periodic', snapshot: 'data:image/png;base64,b' },
          ],
        },
        isLoading: false,
      });

      renderPage();

      expect(screen.getByText('Webcam timeline')).toBeInTheDocument();
      expect(screen.getByText(/multiple_faces — strike 1/)).toBeInTheDocument();
      const tiles = screen.getAllByRole('button', { name: /webcam snapshot/i });
      expect(tiles).toHaveLength(2);

      await userEvent.click(tiles[0]);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      const enlargedImage = within(screen.getByRole('dialog')).getByRole('img');
      expect(enlargedImage).toHaveAttribute('src', 'data:image/png;base64,a');
    });

    it('shows the empty state when there is no webcam timeline data', () => {
      (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
      renderPage();

      expect(screen.getByText('No webcam snapshots recorded.')).toBeInTheDocument();
    });

    it('renders both the webcam snapshot and the screen capture for an entry that has both, each with its own enlarge affordance', async () => {
      (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
      (useCandidateReport as jest.Mock).mockReturnValue({
        data: {
          ...candidateDetail,
          webcamTimeline: [
            {
              occurredAt: '2026-01-01T00:05:00.000Z',
              kind: 'violation',
              reason: 'multiple_faces',
              strike: 1,
              snapshot: 'data:image/png;base64,snap',
              screenshot: 'data:image/png;base64,screen',
            },
          ],
        },
        isLoading: false,
      });

      renderPage();

      expect(screen.getByText('Screen capture')).toBeInTheDocument();
      const snapshotButton = screen.getByRole('button', { name: /webcam snapshot/i });
      const screenshotButton = screen.getByRole('button', { name: /screen capture/i });

      await userEvent.click(screenshotButton);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,screen');
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));

      await userEvent.click(snapshotButton);
      expect(within(screen.getByRole('dialog')).getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,snap');
    });

    it('renders only the screen capture, with no "No image" placeholder, when an entry has a screenshot but no snapshot', () => {
      (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
      (useCandidateReport as jest.Mock).mockReturnValue({
        data: {
          ...candidateDetail,
          webcamTimeline: [
            { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'tab_switch', strike: 1, snapshot: '', screenshot: 'data:image/png;base64,screen' },
          ],
        },
        isLoading: false,
      });

      renderPage();

      expect(screen.getByRole('button', { name: /screen capture/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /webcam snapshot/i })).not.toBeInTheDocument();
      expect(screen.queryByText('No image')).not.toBeInTheDocument();
    });

    it('renders the "No image" placeholder without breaking layout when an entry has neither snapshot nor screenshot', () => {
      (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
      (useCandidateReport as jest.Mock).mockReturnValue({
        data: {
          ...candidateDetail,
          webcamTimeline: [
            { occurredAt: '2026-01-01T00:05:00.000Z', kind: 'violation', reason: 'tab_switch', strike: 1, snapshot: '' },
          ],
        },
        isLoading: false,
      });

      renderPage();

      expect(screen.getByText('No image')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /webcam snapshot/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /screen capture/i })).not.toBeInTheDocument();
    });

    it('shows the same cap-reached copy as the live log instead of "No image" when screenshotCapReached is set', () => {
      (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
      (useCandidateReport as jest.Mock).mockReturnValue({
        data: {
          ...candidateDetail,
          webcamTimeline: [
            {
              occurredAt: '2026-01-01T00:05:00.000Z',
              kind: 'violation',
              reason: 'multiple_faces',
              strike: 1,
              snapshot: 'data:image/png;base64,snap',
              screenshotCapReached: true,
            },
          ],
        },
        isLoading: false,
      });

      renderPage();

      expect(screen.getByText('Screen-capture limit reached — no image for this event')).toBeInTheDocument();
      expect(screen.queryByText('No image')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /screen capture/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /webcam snapshot/i })).toBeInTheDocument();
    });
  });
});
