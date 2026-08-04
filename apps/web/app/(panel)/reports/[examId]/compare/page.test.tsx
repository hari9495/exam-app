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
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('invitationIds=i1,i2'));
    (useCandidateComparison as jest.Mock).mockReturnValue({
      data: [
        {
          candidateId: 'c1', invitationId: 'i1', candidateName: 'Alice', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass',
          proctoringAnalysis: null, integrityAnalysis: null, sectionScores: [{ sectionId: 's1', title: 'Section One', score: 8, maxScore: 10 }],
        },
        {
          candidateId: 'c2', invitationId: 'i2', candidateName: 'Bob', status: 'submitted', score: 4, maxScore: 10, percentage: 40, passFail: 'fail',
          proctoringAnalysis: null, integrityAnalysis: null, sectionScores: [{ sectionId: 's1', title: 'Section One', score: 4, maxScore: 10 }],
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

  it('renders an Integrity row with a badge per candidate reflecting each one\'s level', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('invitationIds=i1,i2'));
    (useCandidateComparison as jest.Mock).mockReturnValue({
      data: [
        {
          candidateId: 'c1', invitationId: 'i1', candidateName: 'Alice', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass',
          proctoringAnalysis: null,
          integrityAnalysis: { status: 'completed', level: 'high_concern', flags: [], narrative: null },
          sectionScores: [{ sectionId: 's1', title: 'Section One', score: 8, maxScore: 10 }],
        },
        {
          candidateId: 'c2', invitationId: 'i2', candidateName: 'Bob', status: 'submitted', score: 4, maxScore: 10, percentage: 40, passFail: 'fail',
          proctoringAnalysis: null, integrityAnalysis: null,
          sectionScores: [{ sectionId: 's1', title: 'Section One', score: 4, maxScore: 10 }],
        },
      ],
      isLoading: false,
    });

    render(<PanelComparePage />);

    expect(screen.getByText('Integrity')).toBeInTheDocument();
    expect(screen.getByText('Integrity: High concern')).toBeInTheDocument();
    expect(screen.getByText('Integrity: —')).toBeInTheDocument();
  });

  it('shows an inline message instead of calling the API when fewer than 2 invitationIds are given', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('invitationIds=i1'));
    (useCandidateComparison as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });

    render(<PanelComparePage />);

    expect(screen.getByText('Select at least 2 candidates to compare.')).toBeInTheDocument();
  });

  it('compares two rows that share a candidateId (a re-invited candidate) as distinct columns', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('invitationIds=i1,i1-retry'));
    (useCandidateComparison as jest.Mock).mockReturnValue({
      data: [
        {
          candidateId: 'c1', invitationId: 'i1', candidateName: 'Alice', status: 'submitted', score: 3, maxScore: 10, percentage: 30, passFail: 'fail',
          proctoringAnalysis: null, integrityAnalysis: null, sectionScores: [],
        },
        {
          candidateId: 'c1', invitationId: 'i1-retry', candidateName: 'Alice', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass',
          proctoringAnalysis: null, integrityAnalysis: null, sectionScores: [],
        },
      ],
      isLoading: false,
    });

    render(<PanelComparePage />);

    expect(screen.getByText('30.0%')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
  });
});
