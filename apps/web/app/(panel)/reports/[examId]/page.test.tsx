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
});
