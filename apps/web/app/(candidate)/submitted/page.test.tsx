import { render, screen } from '@testing-library/react';
import { useAttemptQuery } from '../../../lib/hooks/useAttempt';
import CandidateSubmittedPage from './page';

jest.mock('../../../lib/hooks/useAttempt', () => ({ useAttemptQuery: jest.fn() }));

describe('CandidateSubmittedPage', () => {
  it('shows the static submitted message with no extra data when feedback is null (still in progress / loading)', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });

    render(<CandidateSubmittedPage />);

    expect(screen.getByText('Exam submitted')).toBeInTheDocument();
  });

  it('renders the result summary once feedback is present', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({
      data: {
        status: 'submitted', remainingSeconds: 0, sections: [], answers: [], messages: [],
        feedback: { status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null },
      },
      isLoading: false,
    });

    render(<CandidateSubmittedPage />);

    expect(screen.getByText('Exam submitted')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
  });
});
