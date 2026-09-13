import { render, screen, fireEvent } from '@testing-library/react';
import * as hooks from '../../lib/hooks/useInterviews';
import { InterviewQuestionsPanel, ScorecardPanel } from './InterviewAi';

jest.mock('../../lib/hooks/useInterviews');

const mockedQuestions = hooks.useGenerateInterviewQuestions as jest.Mock;
const mockedScorecard = hooks.useGenerateScorecard as jest.Mock;

describe('InterviewQuestionsPanel', () => {
  it('calls the mutation with the trimmed focus and renders returned questions', () => {
    const mutate = jest.fn();
    mockedQuestions.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      data: { questions: [{ question: 'Explain event loop', category: 'technical', rationale: 'depth' }] },
    });

    render(<InterviewQuestionsPanel entryId="entry-1" />);
    fireEvent.change(screen.getByLabelText('Interview question focus'), { target: { value: '  system design  ' } });
    fireEvent.click(screen.getByRole('button', { name: /suggest questions/i }));

    expect(mutate).toHaveBeenCalledWith({ focus: 'system design' });
    expect(screen.getByText('Explain event loop')).toBeInTheDocument();
    expect(screen.getByText(/Technical · depth/)).toBeInTheDocument();
  });

  it('surfaces an error message', () => {
    mockedQuestions.mockReturnValue({ mutate: jest.fn(), isPending: false, isError: true, error: new Error('AI is not configured for your organization.') });
    render(<InterviewQuestionsPanel entryId="entry-1" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/not configured/i);
  });
});

describe('ScorecardPanel', () => {
  it('disables generate until notes are entered, then submits and renders the scorecard', () => {
    const mutate = jest.fn();
    mockedScorecard.mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      data: { recommendation: 'strong_yes', summary: 'Great fit.', competencies: [{ name: 'System design', rating: 5, justification: 'clear' }], strengths: ['communication'], concerns: [] },
    });

    render(<ScorecardPanel interviewId="int-1" />);
    const btn = screen.getByRole('button', { name: /generate scorecard/i });
    expect(btn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Interview notes'), { target: { value: 'Strong candidate' } });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    expect(mutate).toHaveBeenCalledWith({ notes: 'Strong candidate' });
    expect(screen.getByText('Strong yes')).toBeInTheDocument();
    expect(screen.getByText(/System design/)).toBeInTheDocument();
    expect(screen.getByText('communication')).toBeInTheDocument();
  });
});
