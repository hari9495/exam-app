import { render, screen } from '@testing-library/react';
import { LeaderboardPanel } from './LeaderboardPanel';

describe('LeaderboardPanel', () => {
  it('renders ranked rows with candidate name and correct count', () => {
    render(
      <LeaderboardPanel
        leaderboard={[
          { rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 5 },
          { rank: 2, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 },
        ]}
      />,
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows an empty-state message when no one has answered yet', () => {
    render(<LeaderboardPanel leaderboard={[]} />);

    expect(screen.getByText(/no answers yet/i)).toBeInTheDocument();
  });
});
