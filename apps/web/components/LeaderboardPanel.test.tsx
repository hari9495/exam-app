import { render, screen } from '@testing-library/react';
import * as useExamMonitoringModule from '../lib/hooks/useExamMonitoring';
import { LeaderboardPanel } from './LeaderboardPanel';

describe('LeaderboardPanel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders ranked rows with candidate name and correct count', () => {
    jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
      roster: [],
      alerts: [],
      leaderboard: [
        { rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 5 },
        { rank: 2, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 },
      ],
      connectionStatus: 'connected',
      joinError: null,
    });

    render(<LeaderboardPanel examId="exam-1" />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows an empty-state message when no one has answered yet', () => {
    jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
      roster: [], alerts: [], leaderboard: [], connectionStatus: 'connected', joinError: null,
    });

    render(<LeaderboardPanel examId="exam-1" />);

    expect(screen.getByText(/no answers yet/i)).toBeInTheDocument();
  });
});
