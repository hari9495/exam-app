import { render, screen } from '@testing-library/react';
import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateComparison } from '../../../../../lib/hooks/usePanelReports';
import PanelComparePage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../../../lib/hooks/usePanelReports', () => ({ useCandidateComparison: jest.fn() }));

describe('PanelComparePage', () => {
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1' });
  });

  it('renders a column per selected candidate with overall and section scores', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('candidateIds=c1,c2'));
    (useCandidateComparison as jest.Mock).mockReturnValue({
      data: [
        {
          candidateId: 'c1', candidateName: 'Alice', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass',
          proctoringAnalysis: null, sectionScores: [{ sectionId: 's1', title: 'Section One', score: 8, maxScore: 10 }],
        },
        {
          candidateId: 'c2', candidateName: 'Bob', status: 'submitted', score: 4, maxScore: 10, percentage: 40, passFail: 'fail',
          proctoringAnalysis: null, sectionScores: [{ sectionId: 's1', title: 'Section One', score: 4, maxScore: 10 }],
        },
      ],
      isLoading: false,
    });

    render(<PanelComparePage />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('shows an inline message instead of calling the API when fewer than 2 candidateIds are given', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('candidateIds=c1'));
    (useCandidateComparison as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });

    render(<PanelComparePage />);

    expect(screen.getByText('Select at least 2 candidates to compare.')).toBeInTheDocument();
  });
});
