import { render, screen } from '@testing-library/react';
import { ResultSummary } from './ResultSummary';

describe('ResultSummary', () => {
  it('renders nothing extra for visibility "none"', () => {
    render(<ResultSummary feedback={{ status: 'settled', visibility: 'none', passFail: null, percentage: null, sections: null }} />);
    expect(screen.queryByText(/pass|fail|%/i)).not.toBeInTheDocument();
  });

  it('renders nothing for status pending_review (the submitted page owns the "under review" copy)', () => {
    const { container } = render(
      <ResultSummary feedback={{ status: 'pending_review', visibility: 'breakdown', passFail: null, percentage: null, sections: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows pass/fail for visibility "pass_fail"', () => {
    render(<ResultSummary feedback={{ status: 'settled', visibility: 'pass_fail', passFail: 'pass', percentage: null, sections: null }} />);
    expect(screen.getByText(/pass/i)).toBeInTheDocument();
  });

  it('shows the percentage for visibility "score"', () => {
    render(<ResultSummary feedback={{ status: 'settled', visibility: 'score', passFail: 'fail', percentage: 62.5, sections: null }} />);
    expect(screen.getByText('62.5%')).toBeInTheDocument();
  });

  it('shows a per-section breakdown for visibility "breakdown"', () => {
    render(
      <ResultSummary
        feedback={{
          status: 'settled', visibility: 'breakdown', passFail: 'pass', percentage: 80,
          sections: [{ title: 'Section One', score: 8, maxScore: 10 }],
        }}
      />,
    );
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('8/10')).toBeInTheDocument();
  });
});
