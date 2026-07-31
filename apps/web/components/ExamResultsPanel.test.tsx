import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useResultsList } from '../lib/hooks/usePanelReports';
import { ToastProvider } from './ui';
import { ExamResultsPanel } from './ExamResultsPanel';

jest.mock('../lib/hooks/usePanelReports', () => ({ useResultsList: jest.fn() }));

function renderPanel(examId = 'exam-1') {
  render(
    <ToastProvider>
      <ExamResultsPanel examId={examId} />
    </ToastProvider>,
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: 'c1',
    candidateName: 'Alice',
    invitationId: 'i1',
    attemptId: 'a1',
    status: 'submitted',
    score: 8,
    maxScore: 10,
    percentage: 80,
    passFail: 'pass',
    submittedAt: null,
    proctoringAnalysis: null,
    integrityLevel: 'clear',
    integrityFlagCount: 0,
    ...overrides,
  };
}

describe('ExamResultsPanel', () => {
  it('shows only candidates who attended, not those still invited or revoked', () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice', attemptId: 'a1' }),
        row({ candidateId: 'c2', candidateName: 'Bob', attemptId: null, status: 'invited', score: null, maxScore: null, percentage: null, passFail: null, integrityLevel: null }),
        row({ candidateId: 'c3', candidateName: 'Cara', attemptId: null, status: 'revoked', score: null, maxScore: null, percentage: null, passFail: null, integrityLevel: null }),
      ],
      isLoading: false,
    });

    renderPanel();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Cara')).not.toBeInTheDocument();
  });

  it('shows status, score, result, and integrity for an attended candidate', () => {
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });

    renderPanel();

    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('pass')).toBeInTheDocument();
    expect(screen.getByText('Integrity: Clear')).toBeInTheDocument();
  });

  it('filters by candidate name as the recruiter types', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice Smith' }), row({ candidateId: 'c2', candidateName: 'Bob Jones' })],
      isLoading: false,
    });

    renderPanel();

    await userEvent.type(screen.getByPlaceholderText(/search candidates/i), 'bob');

    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('shows an empty state when nobody has attended yet', () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c2', candidateName: 'Bob', attemptId: null, status: 'invited', score: null, maxScore: null, percentage: null, passFail: null, integrityLevel: null })],
      isLoading: false,
    });

    renderPanel();

    expect(screen.getByText('No candidates have attended this exam yet.')).toBeInTheDocument();
  });

  it('links a candidate to their results detail page with the attempt id', () => {
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });

    renderPanel('exam-1');

    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/reports/exam-1/candidates/c1?attemptId=a1');
  });
});
