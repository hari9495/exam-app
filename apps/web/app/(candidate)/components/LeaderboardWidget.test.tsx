import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as useAttemptModule from '../../../lib/hooks/useAttempt';
import { LeaderboardWidget } from './LeaderboardWidget';

describe('LeaderboardWidget', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the candidate\'s own rank', () => {
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({
      data: { you: { rank: 12, correctCount: 4 }, top: [] },
      isLoading: false,
    } as any);

    render(<LeaderboardWidget enabled />);

    expect(screen.getByText(/#12/)).toBeInTheDocument();
  });

  it('expands to show the anonymized top list, highlighting the viewer\'s own row', async () => {
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({
      data: {
        you: { rank: 2, correctCount: 4 },
        top: [
          { rank: 1, correctCount: 5, label: 'Candidate 1', isYou: false },
          { rank: 2, correctCount: 4, label: 'You', isYou: true },
        ],
      },
      isLoading: false,
    } as any);

    render(<LeaderboardWidget enabled />);
    await userEvent.click(screen.getByRole('button', { name: /leaderboard/i }));

    expect(screen.getByText('Candidate 1')).toBeInTheDocument();
    expect(screen.getAllByText('You')).toHaveLength(1);
  });

  it('renders nothing while loading with no cached data', () => {
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({ data: undefined, isLoading: true } as any);

    const { container } = render(<LeaderboardWidget enabled />);

    expect(container).toBeEmptyDOMElement();
  });

  it('passes the enabled prop through to useLeaderboard instead of always polling', () => {
    const spy = jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({
      data: { you: { rank: 12, correctCount: 4 }, top: [] },
      isLoading: false,
    } as any);

    render(<LeaderboardWidget enabled={false} />);

    expect(spy).toHaveBeenCalledWith(false);
  });
});
