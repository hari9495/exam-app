import { render, screen } from '@testing-library/react';
import { QuestionStatisticsPanel } from './QuestionStatisticsPanel';
import type { QuestionAnalytics } from '../lib/hooks/useQuestions';

const base: QuestionAnalytics = {
  questionId: 'q1', responses: 40, percentCorrect: 0.62, discrimination: 0.41,
  flags: [], options: [], hasEnoughData: true,
};

describe('QuestionStatisticsPanel', () => {
  it('tells the recruiter how far off the threshold it is', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, responses: 7, percentCorrect: null, discrimination: null, hasEnoughData: false }} />);
    expect(screen.getByText(/7 of 20/)).toBeInTheDocument();
  });

  it('shows no statistics at all below the threshold', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, responses: 7, percentCorrect: null, discrimination: null, hasEnoughData: false }} />);
    expect(screen.queryByText(/% correct/i)).not.toBeInTheDocument();
  });

  it('labels the p-value as % correct, never as difficulty', () => {
    render(<QuestionStatisticsPanel analytics={base} />);
    expect(screen.getByText(/62%/)).toBeInTheDocument();
    expect(screen.queryByText(/difficulty/i)).not.toBeInTheDocument();
  });

  it('renders an em dash rather than zero when discrimination is undefined', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, percentCorrect: 1, discrimination: null }} />);
    expect(screen.getByTestId('discrimination').textContent).toBe('—');
  });

  it('surfaces a critical flag with its explanation', () => {
    render(<QuestionStatisticsPanel analytics={{ ...base, discrimination: -0.2, flags: [{ code: 'miskeyed_suspect', severity: 'critical', message: 'Stronger candidates answered this correctly less often than weaker ones, which usually means the answer key is wrong.' }] }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/answer key is wrong/i);
  });

  it('notes that staff test attempts are included', () => {
    render(<QuestionStatisticsPanel analytics={base} />);
    expect(screen.getByText(/test attempts/i)).toBeInTheDocument();
  });

  // Finding 4 (important): the actionable fact for a miskeyed item is *which* option candidates
  // actually picked, not just that some unnamed "Distractor" outscored the key. The option text
  // must be on screen, not just a selection count.
  it('shows the option text, not just Correct answer/Distractor labels', () => {
    render(
      <QuestionStatisticsPanel
        analytics={{
          ...base,
          options: [
            { optionId: 'a', text: 'Paris', isCorrect: true, selections: 6 },
            { optionId: 'b', text: 'Lyon', isCorrect: false, selections: 25 },
          ],
        }}
      />,
    );
    expect(screen.getByText(/Correct answer:\s*Paris/)).toBeInTheDocument();
    expect(screen.getByText(/Distractor:\s*Lyon/)).toBeInTheDocument();
  });
});
