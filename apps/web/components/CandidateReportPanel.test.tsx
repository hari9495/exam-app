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

  it('says how many of a section\'s answers were counted', () => {
    const q = (questionId: string, marksAwarded: number, counted: boolean) => ({
      questionId, questionText: questionId, type: 'code', marks: 10, negativeMarks: 0,
      options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: counted, marksAwarded, counted,
    });
    renderPanel([
      {
        sectionId: 's1', title: 'Coding', score: 18, maxScore: 20, weightPercent: 100, requiredCount: 2,
        questions: [q('q1', 10, true), q('q2', 8, true), q('q3', 0, false)],
      },
    ]);

    expect(screen.getByText('18/20 · 100% weight · best 2 of 3 counted')).toBeInTheDocument();
  });

  it('badges an answer that was dropped by the best-N rule', () => {
    renderPanel([
      {
        sectionId: 's1', title: 'Coding', score: 18, maxScore: 20, weightPercent: 100, requiredCount: 2,
        questions: [
          { questionId: 'q1', questionText: 'A', type: 'code', marks: 10, negativeMarks: 0, options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: true, marksAwarded: 10, counted: true },
          { questionId: 'q2', questionText: 'B', type: 'code', marks: 10, negativeMarks: 0, options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: false, marksAwarded: 0, counted: false },
        ],
      },
    ]);

    expect(screen.getByText('Not counted')).toBeInTheDocument();
  });

  // Finalizing an attempt moves it out of pending_manual_grade, so the grading queue stops
  // listing it and this report becomes the only place the submitted code can still be read.
  describe('code answers', () => {
    const codeQuestion = (overrides: Record<string, unknown> = {}) => ({
      questionId: 'q1', questionText: 'Reverse a string', type: 'code', marks: 10, negativeMarks: 0,
      options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: null, marksAwarded: 7, counted: true,
      answerText: 'def reverse(s):\n    return s[::-1]', codeLanguage: 'python', gradingFeedback: null,
      ...overrides,
    });

    it('shows the submitted code, its language and the marks awarded', () => {
      renderPanel([
        { sectionId: 's1', title: 'Coding', score: 7, maxScore: 10, weightPercent: 100, questions: [codeQuestion()] },
      ]);

      expect(screen.getByText(/def reverse\(s\):/)).toBeInTheDocument();
      expect(screen.getByText('python')).toBeInTheDocument();
      expect(screen.getByText('7/10')).toBeInTheDocument();
    });

    it("shows the grader's feedback alongside the code when there is any", () => {
      renderPanel([
        {
          sectionId: 's1', title: 'Coding', score: 7, maxScore: 10, weightPercent: 100,
          questions: [codeQuestion({ gradingFeedback: 'Correct, but O(n) extra space.' })],
        },
      ]);

      expect(screen.getByText('Correct, but O(n) extra space.')).toBeInTheDocument();
    });

    it('says so plainly when nothing was submitted, rather than rendering an empty block', () => {
      renderPanel([
        {
          sectionId: 's1', title: 'Coding', score: 0, maxScore: 10, weightPercent: 100,
          questions: [codeQuestion({ answerText: null, marksAwarded: 0, gradingFeedback: 'Not attempted.' })],
        },
      ]);

      // Both the placeholder and the stored feedback say it -- the block is never blank.
      expect(screen.getAllByText(/Not attempted\./).length).toBeGreaterThan(0);
      expect(screen.getByText('0/10')).toBeInTheDocument();
    });

    it('still renders MCQ options as options, not as a code block', () => {
      renderPanel([
        {
          sectionId: 's1', title: 'Aptitude', score: 1, maxScore: 1, weightPercent: 100,
          questions: [{
            questionId: 'q9', questionText: '2 + 2', type: 'single_mcq', marks: 1, negativeMarks: 0,
            options: [{ id: 'o1', text: '4' }, { id: 'o2', text: '5' }],
            selectedOptionIds: ['o1'], correctOptionIds: ['o1'], isCorrect: true, marksAwarded: 1, counted: true,
            answerText: null, codeLanguage: null, gradingFeedback: null,
          }],
        },
      ]);

      expect(screen.getByText(/◉ 4/)).toBeInTheDocument();
      expect(screen.getByText(/○ 5/)).toBeInTheDocument();
    });
  });
});
