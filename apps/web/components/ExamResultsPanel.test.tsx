import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useResultsList, useResultsExport, useQuestionAccuracy } from '../lib/hooks/usePanelReports';
import { ToastProvider } from './ui';
import { ExamResultsPanel } from './ExamResultsPanel';

jest.mock('../lib/hooks/usePanelReports', () => ({ useResultsList: jest.fn(), useResultsExport: jest.fn(), useQuestionAccuracy: jest.fn() }));
jest.mock('./AdvanceToNextRoundModal', () => ({
  AdvanceToNextRoundModal: ({ candidateIds }: { candidateIds: string[] }) => (
    <div data-testid="advance-modal">candidateIds:{JSON.stringify(candidateIds)}</div>
  ),
}));
// The real report panel pulls in several more data hooks; its own rendering is
// covered by the candidate detail page tests.
jest.mock('./CandidateReportPanel', () => ({
  CandidateReportPanel: ({ candidateId, attemptId, backSlot }: { candidateId: string; attemptId: string | null; backSlot?: React.ReactNode }) => (
    <div data-testid="candidate-report">
      {backSlot}
      candidateId:{candidateId};attemptId:{String(attemptId)}
    </div>
  ),
}));

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
    faceEnrolmentStatus: null,
    nextRound: null,
    ...overrides,
  };
}

describe('ExamResultsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: [], isLoading: false });
  });

  describe('face column', () => {
    it('shows Verified for an enrolled candidate', () => {
      (useResultsList as jest.Mock).mockReturnValue({ data: [row({ faceEnrolmentStatus: 'enrolled' })], isLoading: false });
      renderPanel();
      expect(screen.getByText('Verified')).toBeInTheDocument();
    });

    it('shows Not verified when no reference photo was captured', () => {
      (useResultsList as jest.Mock).mockReturnValue({ data: [row({ faceEnrolmentStatus: 'not_verified' })], isLoading: false });
      renderPanel();
      expect(screen.getByText('Not verified')).toBeInTheDocument();
    });

    // Attempts from before this feature existed have no enrolment row -- must render an
    // em-dash cleanly, not an empty badge or a crash. nextRound is given a non-null value here
    // so its own (unrelated) dash doesn't collide with the one under test.
    it('shows a dash for an attempt that predates the feature', () => {
      (useResultsList as jest.Mock).mockReturnValue({
        data: [row({ faceEnrolmentStatus: null, nextRound: { examTitle: 'Round 2', emailStatus: 'sent', invitedAt: '2026-08-06T10:00:00.000Z' } })],
        isLoading: false,
      });
      renderPanel();
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('next round column', () => {
    it('shows a dash for a candidate who was never advanced', () => {
      (useResultsList as jest.Mock).mockReturnValue({ data: [row({ nextRound: null })], isLoading: false });
      renderPanel();
      expect(screen.getByText('Next round')).toBeInTheDocument();
    });

    it('names the target exam and reports the invite as sent', () => {
      (useResultsList as jest.Mock).mockReturnValue({
        data: [row({ nextRound: { examTitle: 'Round 2', emailStatus: 'sent', invitedAt: '2026-08-06T10:00:00.000Z' } })],
        isLoading: false,
      });
      renderPanel();
      expect(screen.getByText('Round 2')).toBeInTheDocument();
      expect(screen.getByText('Sent')).toBeInTheDocument();
    });

    // The case the column exists for: the recruiter must be able to see the invite never left.
    it('reports a failed invite distinctly rather than silently', () => {
      (useResultsList as jest.Mock).mockReturnValue({
        data: [row({ nextRound: { examTitle: 'Round 2', emailStatus: 'failed', invitedAt: '2026-08-06T10:00:00.000Z' } })],
        isLoading: false,
      });
      renderPanel();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.queryByText('Sent')).not.toBeInTheDocument();
    });

    it('shows the queued state while the send is still in flight', () => {
      (useResultsList as jest.Mock).mockReturnValue({
        data: [row({ nextRound: { examTitle: 'Round 2', emailStatus: 'pending', invitedAt: '2026-08-06T10:00:00.000Z' } })],
        isLoading: false,
      });
      renderPanel();
      expect(screen.getByText('In queue')).toBeInTheDocument();
    });
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

  it('numbers rows 1-based by their position in the current view', () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice' }),
        row({ candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2' }),
        row({ candidateId: 'c3', candidateName: 'Cara', invitationId: 'i3' }),
      ],
      isLoading: false,
    });

    renderPanel();

    expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
    const cells = screen.getAllByRole('cell', { name: /^[123]$/ }).map((cell) => cell.textContent);
    expect(cells).toEqual(['1', '2', '3']);
  });

  it('shows the raw score fraction in its own Score column, separate from Percentage', () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', score: 5, maxScore: 6, percentage: 83.3 })],
      isLoading: false,
    });

    renderPanel();

    expect(screen.getByRole('button', { name: 'Score' })).toBeInTheDocument();
    expect(screen.getByText('5/6')).toBeInTheDocument();
    expect(screen.getByText('83.3%')).toBeInTheDocument();
  });

  it('shows a dash in the Score column when the attempt has no score yet', () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', status: 'in_progress', score: null, maxScore: null, percentage: null, passFail: null })],
      isLoading: false,
    });

    renderPanel();

    const headerCell = screen.getByRole('button', { name: 'Score' });
    const scoreColumnIndex = Array.from(headerCell.parentElement?.children ?? []).indexOf(headerCell);
    const dataRow = screen.getAllByRole('row')[1];
    const cellsInRow = within(dataRow).getAllByRole('cell');
    expect(cellsInRow[scoreColumnIndex].textContent).toBe('—');
  });

  it('re-numbers rows after sorting, following the new order rather than the original one', async () => {
    const user = userEvent.setup();
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Zed', percentage: 10 }),
        row({ candidateId: 'c2', candidateName: 'Amy', invitationId: 'i2', percentage: 90 }),
      ],
      isLoading: false,
    });

    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Candidate' }));

    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows[0]).toHaveTextContent('Amy');
    expect(rows[0]).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('Zed');
    expect(rows[1]).toHaveTextContent('2');
  });

  it('offers a column chooser that can hide the Integrity column but never the select column', async () => {
    const user = userEvent.setup();
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });

    renderPanel();
    expect(screen.getByRole('columnheader', { name: 'Integrity' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Choose Columns' }));
    // The select-all checkbox column must not appear as a toggle at all -- hiding it
    // would strand an in-progress bulk selection with no way to change it.
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Select' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Integrity' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('columnheader', { name: 'Integrity' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select All' })).toBeInTheDocument();
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

  it('opens the candidate report inline (with the attempt id) instead of routing away, and Back returns to the table', async () => {
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });

    renderPanel('exam-1');
    await userEvent.click(screen.getByRole('button', { name: 'Alice' }));

    expect(screen.getByTestId('candidate-report')).toHaveTextContent('candidateId:c1;attemptId:a1');
    expect(screen.queryByRole('button', { name: 'Advance to Next Round' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '← Back To Results' }));

    expect(screen.queryByTestId('candidate-report')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
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

  it('filters rows via a Percentage number-filter operator (Greater Than Or Equal To)', async () => {
    const user = userEvent.setup();
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', percentage: 20 }), row({ candidateId: 'c2', candidateName: 'Bob', percentage: 90 })],
      isLoading: false,
    });

    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Greater Than Or Equal To...' }));
    await user.type(screen.getByLabelText('Value'), '70');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('filters rows via the Between operator, accepting the two values in either order', async () => {
    const user = userEvent.setup();
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice', percentage: 20 }),
        row({ candidateId: 'c2', candidateName: 'Bob', percentage: 50 }),
        row({ candidateId: 'c3', candidateName: 'Cara', percentage: 90 }),
      ],
      isLoading: false,
    });

    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Between...' }));
    // Entered backwards (To < From) -- the filter should still treat it as 30-60.
    await user.type(screen.getByLabelText('From'), '60');
    await user.type(screen.getByLabelText('To'), '30');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.queryByText('Cara')).not.toBeInTheDocument();
  });

  it('filters rows via Above Average without opening a value modal', async () => {
    const user = userEvent.setup();
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice', percentage: 10 }),
        row({ candidateId: 'c2', candidateName: 'Bob', percentage: 90 }),
      ],
      isLoading: false,
    });

    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Above Average' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('clears the Percentage filter via "Clear Filter", which only appears once a filter is active', async () => {
    const user = userEvent.setup();
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', percentage: 20 }), row({ candidateId: 'c2', candidateName: 'Bob', percentage: 90 })],
      isLoading: false,
    });

    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    expect(screen.queryByRole('menuitem', { name: 'Clear Filter' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Greater Than Or Equal To...' }));
    await user.type(screen.getByLabelText('Value'), '70');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter by Percentage' }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear Filter' }));

    expect(screen.getByText('Alice')).toBeInTheDocument();
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
      data: [row({ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1' }), row({ candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2' })],
      isLoading: false,
    });
    renderPanel();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select All' }));
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select All' }));
    expect(screen.getByRole('checkbox', { name: 'Select Alice' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Bob' })).not.toBeChecked();
  });

  it('exports the checked candidates as CSV', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.csv' });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useResultsList as jest.Mock).mockReturnValue({
      data: [row({ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1' }), row({ candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2' })],
      isLoading: false,
    });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    renderPanel();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Bob' }));
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mutateAsync).toHaveBeenCalledWith({ format: 'csv', invitationIds: ['i2'] });
  });

  it('exports as Excel when no rows are checked, scoped to nothing (i.e. everything)', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.xlsx' });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

    expect(mutateAsync).toHaveBeenCalledWith({ format: 'xlsx', invitationIds: [] });
  });

  it('checking one row of a re-invited candidate does not also check or export their other invitation row', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.csv' });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', score: 3, maxScore: 10, percentage: 30 }),
        row({ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1-retry', score: 8, maxScore: 10, percentage: 80 }),
      ],
      isLoading: false,
    });
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
    global.URL.revokeObjectURL = jest.fn();

    renderPanel();
    const aliceCheckboxes = screen.getAllByRole('checkbox', { name: 'Select Alice' });
    expect(aliceCheckboxes).toHaveLength(2);

    await userEvent.click(aliceCheckboxes[0]);
    expect(aliceCheckboxes[0]).toBeChecked();
    expect(aliceCheckboxes[1]).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(mutateAsync).toHaveBeenCalledWith({ format: 'csv', invitationIds: ['i1'] });
  });

  it('disables Advance to Next Round until a candidate is checked, then opens it with the checked ids', async () => {
    (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });

    renderPanel();

    expect(screen.getByRole('button', { name: 'Advance to Next Round' })).toBeDisabled();
    expect(screen.queryByTestId('advance-modal')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice' }));
    expect(screen.getByRole('button', { name: 'Advance to Next Round' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Advance to Next Round' }));

    expect(screen.getByTestId('advance-modal')).toHaveTextContent('candidateIds:["c1"]');
  });

  it('advancing to next round dedupes to one candidateId when both of a re-invited candidate\'s rows are checked', async () => {
    (useResultsList as jest.Mock).mockReturnValue({
      data: [
        row({ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1' }),
        row({ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1-retry' }),
      ],
      isLoading: false,
    });

    renderPanel();
    const aliceCheckboxes = screen.getAllByRole('checkbox', { name: 'Select Alice' });
    await userEvent.click(aliceCheckboxes[0]);
    await userEvent.click(aliceCheckboxes[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Advance to Next Round' }));

    expect(screen.getByTestId('advance-modal')).toHaveTextContent('candidateIds:["c1"]');
  });

  describe('sub-tabs', () => {
    const accuracyRows = [
      { questionId: 'q1', questionText: 'Which collection is synchronized?', accuracyPercentage: 0, timesAttempted: 2, timesIncluded: 2 },
      { questionId: 'q2', questionText: 'Choose the correct synonym for Enhance:', accuracyPercentage: 50, timesAttempted: 1, timesIncluded: 2 },
    ];

    it('opens on Candidates with both sub-tabs counted, accuracy list hidden', () => {
      (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });
      (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: accuracyRows, isLoading: false });

      renderPanel();

      expect(screen.getByRole('tab', { name: 'Candidates (1)' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Question accuracy (2)' })).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Which collection is synchronized?')).not.toBeInTheDocument();
    });

    it('shows the question accuracy list for this exam once its sub-tab is selected, without leaving the page', async () => {
      (useResultsList as jest.Mock).mockReturnValue({ data: [row()], isLoading: false });
      (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: accuracyRows, isLoading: false });

      renderPanel();
      await userEvent.click(screen.getByRole('tab', { name: /Question accuracy/ }));

      expect(await screen.findByText('Which collection is synchronized?')).toBeInTheDocument();
      expect(screen.getByText('0.0%')).toBeInTheDocument();
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });
  });
});
