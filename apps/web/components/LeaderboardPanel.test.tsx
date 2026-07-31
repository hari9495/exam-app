import { render, screen } from '@testing-library/react';
import { LeaderboardPanel } from './LeaderboardPanel';
import { RecruiterLeaderboardRow } from '../lib/types';

function row(overrides: Partial<RecruiterLeaderboardRow>): RecruiterLeaderboardRow {
  return {
    rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 5, totalAutoGradableQuestions: 5,
    status: 'submitted', timeTakenSeconds: 65, remainingSeconds: null,
    score: 8, maxScore: 10, percentage: 80, passFail: 'pass', percentile: 90,
    ...overrides,
  };
}

describe('LeaderboardPanel', () => {
  it('renders ranked rows with candidate name and every requested column', () => {
    render(
      <LeaderboardPanel
        leaderboard={[
          row({ rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 5, totalAutoGradableQuestions: 5 }),
          row({ rank: 2, candidateId: 'c2', candidateName: 'Bob', correctCount: 3, totalAutoGradableQuestions: 5, percentile: 40 }),
        ]}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Table gives sortable <th> role="button", overriding the implicit columnheader role.
    expect(screen.getByText('Correct Answers')).toBeInTheDocument();
    expect(screen.getByText('5 / 5')).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('shows an empty-state message when no one has answered yet', () => {
    render(<LeaderboardPanel leaderboard={[]} />);

    expect(screen.getByText(/no answers yet/i)).toBeInTheDocument();
  });

  it('formats time taken and time left as mm:ss', () => {
    render(<LeaderboardPanel leaderboard={[row({ timeTakenSeconds: 125, remainingSeconds: 45 })]} />);

    expect(screen.getByText('02:05')).toBeInTheDocument();
    expect(screen.getByText('00:45')).toBeInTheDocument();
  });

  it('shows a dash for Time Left once the attempt has finished', () => {
    render(<LeaderboardPanel leaderboard={[row({ status: 'submitted', remainingSeconds: null })]} />);

    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('shows the score as a fraction when a Result exists', () => {
    render(<LeaderboardPanel leaderboard={[row({ score: 8, maxScore: 10 })]} />);

    expect(screen.getByText('8 / 10')).toBeInTheDocument();
  });

  it('shows Pending for Score once finished but a code question still needs manual grading', () => {
    render(<LeaderboardPanel leaderboard={[row({ status: 'pending_manual_grade', score: null, passFail: null })]} />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Pending Grade')).toBeInTheDocument();
  });

  it('shows the percentile as a percentage', () => {
    render(<LeaderboardPanel leaderboard={[row({ percentile: 75 })]} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows In Progress for Result while the attempt is still running, not a pass/fail badge', () => {
    render(<LeaderboardPanel leaderboard={[row({ status: 'in_progress', score: null, passFail: null, remainingSeconds: 600 })]} />);

    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.queryByText('Pass')).not.toBeInTheDocument();
    expect(screen.queryByText('Fail')).not.toBeInTheDocument();
  });

  it('shows Pass or Fail once finished with a Result', () => {
    render(
      <LeaderboardPanel
        leaderboard={[
          row({ candidateId: 'c1', candidateName: 'Alice', passFail: 'pass' }),
          row({ candidateId: 'c2', candidateName: 'Bob', passFail: 'fail' }),
        ]}
      />,
    );

    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });
});
