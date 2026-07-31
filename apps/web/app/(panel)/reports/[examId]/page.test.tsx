import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams, useRouter } from 'next/navigation';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import { ToastProvider } from '../../../../components/ui';
import PanelExamResultsPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useRouter: jest.fn() }));
jest.mock('../../../../lib/hooks/useExams', () => ({ useExam: jest.fn() }));
jest.mock('../../../../lib/hooks/usePanelReports', () => ({
  useResultsSummary: jest.fn(),
  useQuestionAccuracy: jest.fn(),
  useResultsList: jest.fn(),
  useResultsExport: jest.fn(),
}));

const resultRows = [
  { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: null, proctoringAnalysis: null, integrityLevel: 'clear', integrityFlagCount: 0 },
  { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'submitted', score: 4, maxScore: 10, percentage: 40, passFail: 'fail', submittedAt: null, proctoringAnalysis: null, integrityLevel: 'high_concern', integrityFlagCount: 2 },
];

function renderPage() {
  render(
    <ToastProvider>
      <PanelExamResultsPage />
    </ToastProvider>,
  );
}

describe('PanelExamResultsPage', () => {
  const push = jest.fn();
  const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.csv' });

  beforeEach(() => {
    push.mockClear();
    mutateAsync.mockClear();
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1' });
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useExam as jest.Mock).mockReturnValue({ data: { id: 'exam-1', title: 'Backend Screening' } });
    (useResultsSummary as jest.Mock).mockReturnValue({
      data: { totalCandidates: 2, settledCount: 2, inProgressCount: 0, notStartedCount: 0, passRate: 50, averagePercentage: 60, scoreDistribution: [], attemptDuration: null },
      isLoading: false,
    });
    (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    (useResultsList as jest.Mock).mockReturnValue({ data: resultRows, isLoading: false });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders the exam title, summary stats, and candidate rows with links', () => {
    renderPage();

    expect(screen.getByText('Backend Screening')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/reports/exam-1/candidates/c1?attemptId=a1');
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/reports/exam-1/candidates/c2?attemptId=a2');
  });

  it('enables Compare selected only once at least 2 candidates are checked, then navigates with the selected ids', async () => {
    renderPage();

    const compareButton = screen.getByRole('button', { name: 'Compare selected' });
    expect(compareButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice' }));
    expect(compareButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Bob' }));
    expect(compareButton).toBeEnabled();

    await userEvent.click(compareButton);
    expect(push).toHaveBeenCalledWith('/reports/exam-1/compare?candidateIds=c1,c2');
  });

  it('renders an integrity badge per candidate row', () => {
    renderPage();

    expect(screen.getByText('Integrity: Clear')).toBeInTheDocument();
    expect(screen.getByText('Integrity: High concern')).toBeInTheDocument();
  });

  it('shows friendly status labels instead of raw backend status strings', () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        ...resultRows,
        { candidateId: 'c3', candidateName: 'Cara', invitationId: 'i3', attemptId: 'a3', status: 'pending_manual_grade', score: null, maxScore: 10, percentage: null, passFail: null, submittedAt: null, proctoringAnalysis: null, integrityLevel: null, integrityFlagCount: 0 },
      ],
      isLoading: false,
    });
    renderPage();

    expect(screen.getAllByText('Submitted')).toHaveLength(2);
    expect(screen.getByText('Pending Grade')).toBeInTheDocument();
  });

  it('filters the candidate rows by the selected integrity level', async () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bob' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Integrity' }));
    await userEvent.click(screen.getByRole('option', { name: 'High concern' }));

    expect(screen.queryByRole('link', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bob' })).toBeInTheDocument();
  });

  it('triggers an export download when an export format button is clicked', async () => {
    const createObjectURL = jest.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mutateAsync).toHaveBeenCalledWith('csv');
    expect(createObjectURL).toHaveBeenCalled();
  });

  describe('tabbed layout', () => {
    const accuracyRows = [
      { questionId: 'q1', questionText: 'Which collection is synchronized?', accuracyPercentage: 0, timesAttempted: 2, timesIncluded: 2 },
      { questionId: 'q2', questionText: 'Choose the correct synonym for Enhance:', accuracyPercentage: 50, timesAttempted: 1, timesIncluded: 2 },
    ];

    it('opens on Candidates, so a long question list cannot bury them below the fold', () => {
      // This is the whole point of the change: an exam with many questions used
      // to push the candidate list off-screen.
      (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: accuracyRows, isLoading: false });
      renderPage();

      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Which collection is synchronized?')).not.toBeInTheDocument();
    });

    it('shows the question accuracy list once its tab is selected', async () => {
      (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: accuracyRows, isLoading: false });
      renderPage();

      await userEvent.click(screen.getByRole('tab', { name: /Question accuracy/ }));

      expect(await screen.findByText('Which collection is synchronized?')).toBeInTheDocument();
    });

    it('counts each tab so the split is visible without opening them', () => {
      (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: accuracyRows, isLoading: false });
      renderPage();

      expect(screen.getByRole('tab', { name: 'Candidates (2)' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Question accuracy (2)' })).toBeInTheDocument();
    });

    it('keeps the candidate tab count in step with the integrity filter', async () => {
      // The count and the grid are derived from one list, so they cannot drift.
      (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: accuracyRows, isLoading: false });
      renderPage();

      await userEvent.click(screen.getByRole('combobox', { name: /Integrity/ }));
      await userEvent.click(await screen.findByRole('option', { name: 'High concern' }));

      expect(await screen.findByRole('tab', { name: 'Candidates (1)' })).toBeInTheDocument();
      expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });
});
