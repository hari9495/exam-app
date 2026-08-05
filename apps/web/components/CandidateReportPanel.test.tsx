import { render, screen } from '@testing-library/react';
import { CandidateReportPanel } from './CandidateReportPanel';
import { ToastProvider } from './ui';

// The panel pulls from five hooks; mocking the hook modules keeps this focused on what it
// RENDERS rather than re-testing the fetch layer those hooks already have coverage for.
jest.mock('../lib/hooks/usePanelReports', () => ({
  useCandidateReport: jest.fn(),
  useAttemptInsight: () => ({ data: undefined, isLoading: false }),
  useRegenerateAttemptInsight: () => ({ mutate: jest.fn(), isPending: false }),
  useResultsList: () => ({ data: [] }),
}));
jest.mock('../lib/hooks/useSystemEvents', () => ({
  useSystemEvents: () => ({ data: undefined, isLoading: false }),
}));
jest.mock('./AuditHistoryLink', () => ({ AuditHistoryLink: () => null }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useCandidateReport } = require('../lib/hooks/usePanelReports');

function renderPanel(sections: unknown[]) {
  (useCandidateReport as jest.Mock).mockReturnValue({
    data: {
      candidateName: 'Ada Lovelace',
      score: 45,
      maxScore: 60,
      percentage: 60,
      passFail: 'pass',
      integrityAnalysis: null,
      webcamTimeline: [],
      sections,
    },
    isLoading: false,
  });

  render(
    <ToastProvider>
      <CandidateReportPanel examId="exam-1" candidateId="cand-1" attemptId="attempt-1" />
    </ToastProvider>,
  );
}

describe('CandidateReportPanel', () => {
  it("shows each section's weight percentage next to its raw score", () => {
    renderPanel([
      { sectionId: 's1', title: 'Coding', score: 45, maxScore: 60, weightPercent: 60, questions: [] },
    ]);

    expect(screen.getByText('45/60 · 60% weight')).toBeInTheDocument();
  });

  // The weighted percentage is what drives pass/fail, so a recruiter looking at two sections with
  // identical raw scores needs the weights visible to explain why one mattered more.
  it('distinguishes two sections carrying the same raw score but different weights', () => {
    renderPanel([
      { sectionId: 's1', title: 'Coding', score: 5, maxScore: 10, weightPercent: 80, questions: [] },
      { sectionId: 's2', title: 'Aptitude', score: 5, maxScore: 10, weightPercent: 20, questions: [] },
    ]);

    expect(screen.getByText('5/10 · 80% weight')).toBeInTheDocument();
    expect(screen.getByText('5/10 · 20% weight')).toBeInTheDocument();
  });

  it('shows 0% weight for a legacy attempt whose snapshot predates section weighting', () => {
    renderPanel([
      { sectionId: 's1', title: 'Coding', score: 45, maxScore: 60, weightPercent: 0, questions: [] },
    ]);

    expect(screen.getByText('45/60 · 0% weight')).toBeInTheDocument();
  });
});
