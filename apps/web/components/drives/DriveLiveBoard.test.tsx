import { render, screen } from '@testing-library/react';
import { DriveLiveBoard } from './DriveLiveBoard';
import { QueryProvider } from '../../lib/query-provider';

jest.mock('../../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'demo-org' }) }));

const ROSTER = {
  counts: { registered: 1, inProgress: 1, submitted: 0, passed: 1, failed: 0 },
  rows: [
    { invitationId: 'inv-1', candidateName: 'Registered Rani', examTitle: 'Backend Round', state: 'registered', startedAt: null, score: null },
    {
      invitationId: 'inv-2',
      candidateName: 'Progress Priya',
      examTitle: 'Backend Round',
      state: 'in_progress',
      startedAt: '2026-08-17T09:00:00.000Z',
      score: null,
    },
    {
      invitationId: 'inv-3',
      candidateName: 'Passed Pavan',
      examTitle: 'Backend Round',
      state: 'passed',
      startedAt: '2026-08-17T08:00:00.000Z',
      score: 88,
      candidateId: 'cand-3',
      examId: 'exam-1',
      attemptId: 'attempt-3',
    },
  ],
};

function renderBoard() {
  return render(
    <QueryProvider>
      <DriveLiveBoard driveId="drive-1" />
    </QueryProvider>,
  );
}

function mockFetch() {
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/drives/drive-1/live')) {
      return new Response(JSON.stringify(ROSTER), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('DriveLiveBoard', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders the four-count strip', async () => {
    mockFetch();
    renderBoard();

    // "Registered" etc. appear twice each: once as the stat-tile label, once as the
    // group badge below -- getAllByText covers both without over-specifying which is which.
    expect(await screen.findAllByText('Registered')).toHaveLength(2);
    expect(screen.getAllByText('In progress')).toHaveLength(2);
    expect(screen.getAllByText('Submitted')).toHaveLength(2);
    expect(screen.getAllByText('Passed')).toHaveLength(2);
  });

  it('groups candidate chips under their state', async () => {
    mockFetch();
    renderBoard();

    const registeredChip = await screen.findByText('Registered Rani');
    const progressChip = screen.getByText('Progress Priya');
    const passedChip = screen.getByText('Passed Pavan');

    // Each chip sits inside a group card whose badge names that candidate's state.
    expect(registeredChip.closest('.rounded-lg')?.textContent).toContain('Registered');
    expect(progressChip.closest('.rounded-lg')?.textContent).toContain('In progress');
    expect(passedChip.closest('.rounded-lg')?.textContent).toContain('Passed');
  });

  it('links a chip to the candidate report when the row carries candidateId/examId', async () => {
    mockFetch();
    renderBoard();

    const link = await screen.findByRole('link', { name: 'Passed Pavan' });
    expect(link).toHaveAttribute('href', '/reports/exam-1/candidates/cand-3?attemptId=attempt-3');
  });

  it('renders a chip as plain text (no link) when the row has no candidateId/examId', async () => {
    mockFetch();
    renderBoard();

    await screen.findByText('Registered Rani');
    expect(screen.queryByRole('link', { name: 'Registered Rani' })).not.toBeInTheDocument();
  });
});
