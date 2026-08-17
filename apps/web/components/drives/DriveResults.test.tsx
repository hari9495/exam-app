import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DriveResults } from './DriveResults';
import { QueryProvider } from '../../lib/query-provider';

jest.mock('../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org' }) }));

const ROSTER = {
  counts: { registered: 1, inProgress: 0, submitted: 0, passed: 1, failed: 0 },
  rows: [
    {
      invitationId: 'inv-1',
      candidateName: 'Zed Never Started',
      examTitle: 'Backend Round',
      state: 'registered',
      startedAt: null,
      score: null,
    },
    {
      invitationId: 'inv-2',
      candidateName: 'Amy Passed',
      examTitle: 'Backend Round',
      state: 'passed',
      startedAt: '2026-08-17T08:00:00.000Z',
      score: 88,
      candidateId: 'cand-2',
      examId: 'exam-1',
      attemptId: 'attempt-2',
    },
  ],
};

function renderResults() {
  return render(
    <QueryProvider>
      <DriveResults driveId="drive-1" />
    </QueryProvider>,
  );
}

function mockFetch() {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/drives/drive-1/results')) {
      return new Response(JSON.stringify(ROSTER), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
}

function candidateCellsInOrder() {
  const rows = screen.getAllByRole('row').slice(1); // drop header row
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent);
}

describe('DriveResults', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('relabels a registered row as "Did not attempt" now that the drive has ended', async () => {
    mockFetch();
    renderResults();

    await screen.findByText('Zed Never Started');
    expect(screen.getByText('Did not attempt')).toBeInTheDocument();
    expect(screen.queryByText('Registered')).not.toBeInTheDocument();
  });

  it('links a row with candidateId/examId to the candidate report', async () => {
    mockFetch();
    renderResults();

    const link = await screen.findByRole('link', { name: 'Amy Passed' });
    expect(link).toHaveAttribute('href', '/reports/exam-1/candidates/cand-2?attemptId=attempt-2');
  });

  it('sorts by candidate name when the Candidate header is clicked', async () => {
    mockFetch();
    renderResults();
    await screen.findByText('Zed Never Started');

    // Unsorted (fetch) order is Zed, then Amy.
    expect(candidateCellsInOrder()[0]).toContain('Zed Never Started');

    await userEvent.click(screen.getByRole('button', { name: /candidate/i }));
    expect(candidateCellsInOrder()[0]).toContain('Amy Passed');

    await userEvent.click(screen.getByRole('button', { name: /candidate/i }));
    expect(candidateCellsInOrder()[0]).toContain('Zed Never Started');
  });

  it('filters rows by the search box', async () => {
    mockFetch();
    renderResults();
    await screen.findByText('Zed Never Started');

    await userEvent.type(screen.getByLabelText('Search candidates'), 'Amy');

    expect(screen.getByText('Amy Passed')).toBeInTheDocument();
    expect(screen.queryByText('Zed Never Started')).not.toBeInTheDocument();
  });

  it('offers a CSV export button', async () => {
    mockFetch();
    renderResults();
    await screen.findByText('Zed Never Started');

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });
});
