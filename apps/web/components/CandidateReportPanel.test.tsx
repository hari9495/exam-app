import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderPanel(sections: unknown[], overrides: Record<string, unknown> = {}) {
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
      ...overrides,
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

  it('shows a tab-activity summary and a per-question banner when the report has activity', async () => {
    (useCandidateReport as jest.Mock).mockReturnValue({
      data: {
        candidateName: 'Ada Lovelace',
        score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        integrityAnalysis: null,
        webcamTimeline: [],
        tabActivitySummary: [{ eventType: 'background_app_detected', count: 1, toolCounts: { WhatsApp: 1 } }],
        proctoringAnalysis: { status: 'completed', riskLevel: 'high', summary: 'Suspicious pattern noted.' },
        sections: [
          {
            sectionId: 's1', title: 'Coding', score: 10, maxScore: 10, weightPercent: 100, requiredCount: null,
            questions: [
              {
                questionId: 'q1', questionText: 'Reverse a string', type: 'code', marks: 10, negativeMarks: 0,
                options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: true, marksAwarded: 10, counted: true,
                answerText: 'def reverse(s): return s[::-1]', codeLanguage: 'python', gradingFeedback: null,
                tabActivity: [{ eventType: 'background_app_detected', occurredAt: '2026-01-01T00:07:00.000Z', toolName: 'WhatsApp', reasoning: 'Taskbar icon visible.', screenshot: undefined }],
              },
            ],
          },
        ],
      },
      isLoading: false,
    });

    render(
      <ToastProvider>
        <CandidateReportPanel examId="exam-1" candidateId="cand-1" attemptId="attempt-1" />
      </ToastProvider>,
    );

    expect(screen.getByText('Tabs & Background Apps')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp × 1')).toBeInTheDocument();
    expect(screen.getByText('Suspicious pattern noted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /WhatsApp/ })).toBeInTheDocument();
  });

  describe('face verification', () => {
    it('shows the reference photo when the candidate enrolled', () => {
      renderPanel([], { faceEnrolment: { status: 'enrolled', referenceImageUrl: 'https://blob/face.jpg?sig=x', capturedAt: '2026-08-11T09:00:00.000Z' } });
      expect(screen.getByAltText(/reference photo/i)).toHaveAttribute('src', 'https://blob/face.jpg?sig=x');
    });

    it('says so plainly when no reference was captured', () => {
      renderPanel([], { faceEnrolment: { status: 'not_verified', referenceImageUrl: null, capturedAt: null } });
      expect(screen.getByText(/not verified/i)).toBeInTheDocument();
    });

    it('renders nothing for an attempt from before the feature existed', () => {
      renderPanel([], { faceEnrolment: null });
      expect(screen.queryByText(/face verification/i)).not.toBeInTheDocument();
    });

    it('renders no comparison when the feature is on but there were no mismatches', () => {
      renderPanel([], {
        faceEnrolment: { status: 'enrolled', referenceImageUrl: 'https://blob/face.jpg?sig=x', capturedAt: '2026-08-11T09:00:00.000Z' },
        faceMismatches: [],
      });
      expect(screen.queryByText(/flagged snapshot/i)).not.toBeInTheDocument();
    });

    // The reference photo also appears in the card header (outside the mismatch row) whenever
    // referenceImageUrl is set, so this test scopes every assertion to the mismatch row itself
    // via `within` -- a reviewer deleting the in-row <img> must fail THIS test, not pass because
    // getAllByAltText('Reference photo') happened to also match the unrelated header photo.
    it('renders the reference photo and the flagged snapshot side by side, with the score, its caveat, and the timestamp visible', () => {
      renderPanel([], {
        faceEnrolment: { status: 'enrolled', referenceImageUrl: 'https://blob/face.jpg?sig=ref', capturedAt: '2026-08-11T09:00:00.000Z' },
        faceMismatches: [
          { occurredAt: '2026-08-12T09:00:00.000Z', score: 0.214, snapshotUrl: 'https://blob/snap.jpg?sig=snap' },
        ],
      });

      const row = within(screen.getByTestId('mismatch-row'));
      expect(row.getByAltText('Reference photo (comparison)')).toHaveAttribute('src', 'https://blob/face.jpg?sig=ref');
      expect(row.getByAltText('Flagged snapshot')).toHaveAttribute('src', 'https://blob/snap.jpg?sig=snap');
      expect(row.getByText('Similarity score: 0.21')).toBeInTheDocument();
      expect(row.getByText(/not yet calibrated/i)).toBeInTheDocument();
      expect(row.getByText(new Date('2026-08-12T09:00:00.000Z').toLocaleString())).toBeInTheDocument();
      // The header photo (outside the row) keeps the plain "Reference photo" alt -- only one of
      // it, distinguishing it from the in-row comparison copy above (finding 7).
      expect(screen.getAllByAltText('Reference photo')).toHaveLength(1);
    });

    it('shows a "no image" placeholder instead of a broken image when the snapshot blob is missing', () => {
      renderPanel([], {
        faceEnrolment: { status: 'enrolled', referenceImageUrl: 'https://blob/face.jpg?sig=ref', capturedAt: '2026-08-11T09:00:00.000Z' },
        faceMismatches: [{ occurredAt: '2026-08-12T09:00:00.000Z', score: null, snapshotUrl: null }],
      });

      expect(screen.getByText(/no image/i)).toBeInTheDocument();
      expect(screen.queryByAltText('Flagged snapshot')).not.toBeInTheDocument();
    });

    // A face isn't reliably recognisable at the 96px thumbnail size this row renders at -- a
    // recruiter has to be able to blow the evidence up before ever acting on it.
    it('opens an evidence image at full size when clicked, reusing the webcam-snapshot modal pattern', async () => {
      renderPanel([], {
        faceEnrolment: { status: 'enrolled', referenceImageUrl: 'https://blob/face.jpg?sig=ref', capturedAt: '2026-08-11T09:00:00.000Z' },
        faceMismatches: [
          { occurredAt: '2026-08-12T09:00:00.000Z', score: 0.214, snapshotUrl: 'https://blob/snap.jpg?sig=snap' },
        ],
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /view flagged snapshot full size/i }));

      const dialog = within(screen.getByRole('dialog'));
      expect(dialog.getByAltText('Flagged snapshot')).toHaveAttribute('src', 'https://blob/snap.jpg?sig=snap');
    });

    // FaceRetentionService nulls referenceImagePath 90 days after the attempt finalises but never
    // deletes the face_mismatch events -- this report is the only surface those snapshots are
    // ever visible on, so it must keep showing them even once the reference photo is gone,
    // instead of the whole evidence block silently vanishing behind "no reference photo".
    it('keeps showing flagged snapshots once the reference photo has aged out of retention', () => {
      renderPanel([], {
        faceEnrolment: { status: 'enrolled', referenceImageUrl: null, capturedAt: '2026-05-01T09:00:00.000Z' },
        faceMismatches: [
          { occurredAt: '2026-08-12T09:00:00.000Z', score: 0.214, snapshotUrl: 'https://blob/snap.jpg?sig=snap' },
        ],
      });

      expect(screen.getAllByText(/no longer retained/i).length).toBeGreaterThan(0);
      const row = within(screen.getByTestId('mismatch-row'));
      expect(row.getByAltText('Flagged snapshot')).toHaveAttribute('src', 'https://blob/snap.jpg?sig=snap');
      expect(row.queryByAltText('Reference photo (comparison)')).not.toBeInTheDocument();
    });
  });
});
