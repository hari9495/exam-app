import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useResultsList, useResultsExport } from '../lib/hooks/usePanelReports';
import { ToastProvider } from './ui';
import { ExamResultsPanel } from './ExamResultsPanel';

jest.mock('../lib/hooks/usePanelReports', () => ({ useResultsList: jest.fn(), useResultsExport: jest.fn() }));

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
  beforeEach(() => {
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  });

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

  it('filters rows by clicking the Status column header', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', status: 'submitted' }), row({ candidateId: 'c2', candidateName: 'Bob', status: 'blocked', percentage: null, passFail: null })],
      isLoading: false,
    });

    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Filter by Status' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Blocked' }));

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('filters rows by clicking the Score column header', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', percentage: 20 }), row({ candidateId: 'c2', candidateName: 'Bob', percentage: 90 })],
      isLoading: false,
    });

    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Filter by Score' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'High (≥70%)' }));

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('filters rows by clicking the Result column header, treating a null passFail as pending grade', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice', passFail: 'pass' }),
        row({ candidateId: 'c2', candidateName: 'Bob', passFail: null, status: 'pending_manual_grade', percentage: null }),
      ],
      isLoading: false,
    });

    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Filter by Result' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Pending grade' }));

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('filters rows by clicking the Integrity column header', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', integrityLevel: 'clear' }), row({ candidateId: 'c2', candidateName: 'Bob', integrityLevel: 'high_concern' })],
      isLoading: false,
    });

    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Filter by Integrity' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'High concern' }));

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('selects and deselects a candidate via the row checkbox', async () => {
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });
    renderPanel();

    const checkbox = screen.getByRole('checkbox', { name: 'Select Alice' });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('selects and deselects every visible row via the header "select all" checkbox', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice' }), row({ candidateId: 'c2', candidateName: 'Bob' })],
      isLoading: false,
    });
    renderPanel();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).not.toBeChecked();
  });

  it('exports the checked candidates as CSV', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.csv' });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice' }), row({ candidateId: 'c2', candidateName: 'Bob' })],
      isLoading: false,
    });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    renderPanel();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Bob' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mutateAsync).toHaveBeenCalledWith({ format: 'csv', candidateIds: ['c2'] });
  });

  it('exports as Excel when no rows are checked, scoped to nothing (i.e. everything)', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.xlsx' });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(mutateAsync).toHaveBeenCalledWith({ format: 'xlsx', candidateIds: [] });
  });
});
