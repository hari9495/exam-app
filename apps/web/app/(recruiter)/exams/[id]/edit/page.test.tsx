import { render, screen } from '@testing-library/react';
import EditExamPage from './page';
import { ToastProvider } from '../../../../../components/ui';
import { useExamMonitoring } from '../../../../../lib/hooks/useExamMonitoring';
import { ATTENTION_ALERT_COUNT } from '../../../../../lib/attention-alert';
import { Exam, ProctoringFlag, RosterRow } from '../../../../../lib/types';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'exam-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('../../../../../lib/hooks/useExams', () => ({
  // Reads `currentExam` at call time (not factory-definition time), so tests can
  // vary status/hasStartedAttempts by reassigning it before rendering.
  useExam: () => ({ data: currentExam }),
  useUpdateExam: () => ({ mutate: jest.fn() }),
  usePublishExam: () => ({ mutate: jest.fn() }),
  useUnpublishExam: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../../../../lib/hooks/useExamMonitoring', () => ({ useExamMonitoring: jest.fn() }));

const mockExam: Exam = {
  id: 'exam-1', title: 'Backend Round', instructions: null, status: 'published', durationMinutes: 60,
  passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'none', schedulingEnabled: false,
  availabilityWindowStart: null, availabilityWindowEnd: null, walkInEnabled: false, allowedIpRange: null,
  webcamProctoringEnabled: false, proctoringEnforcement: 'block', proctoringStrikeLimit: 3,
  disabledProctoringSignalsJson: null, screenCaptureEnabled: false, createdAt: '2026-07-25T09:00:00.000Z', sections: [],
  invitationCount: 1, hasStartedAttempts: true, requiresManualGrading: false,
};

let currentExam: Exam = mockExam;
beforeEach(() => {
  currentExam = mockExam;
});

function row(attemptId: string, proctoringBypassed: boolean): RosterRow {
  return {
    candidateId: `cand-${attemptId}`, candidateName: `Candidate ${attemptId}`, invitationId: `inv-${attemptId}`,
    attemptId, status: 'in_progress', online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5,
    proctoringBypassed,
  };
}

function burst(attemptId: string): ProctoringFlag[] {
  return Array.from({ length: ATTENTION_ALERT_COUNT }, (_, i) => ({
    attemptId,
    candidateId: `cand-${attemptId}`,
    eventType: 'tab_switch',
    severity: 'medium',
    occurredAt: new Date(Date.now() - i * 1000).toISOString(),
  }));
}

function mockMonitoring(roster: RosterRow[], alerts: ProctoringFlag[]) {
  (useExamMonitoring as jest.Mock).mockReturnValue({
    roster, alerts, leaderboard: [], connectionStatus: 'connected', joinError: null,
  });
}

// A fresh element each time: React bails out of re-rendering an identical element
// reference, which would defeat the revoke test below.
const page = () => (
  <ToastProvider>
    <EditExamPage />
  </ToastProvider>
);

function renderPage(roster: RosterRow[], alerts: ProctoringFlag[]) {
  mockMonitoring(roster, alerts);
  return render(page());
}

describe('EditExamPage attention flag', () => {
  afterEach(() => jest.clearAllMocks());

  it('counts a bursting candidate on the Live tab', () => {
    renderPage([row('a1', false)], burst('a1'));

    expect(screen.getByRole('tab', { name: 'Live (1)' })).toBeInTheDocument();
  });

  it('does not flag or count a candidate whose proctoring has been relaxed', () => {
    // The recruiter already took the only action the product offers. The bypass stops
    // enforcement but not recording, so the events keep arriving -- without the
    // exclusion this row would demand attention for the rest of the exam.
    renderPage([row('a1', true)], burst('a1'));

    expect(screen.getByRole('tab', { name: 'Live' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Live \(/ })).not.toBeInTheDocument();
  });

  it('counts only the non-bypassed candidates when several are bursting', () => {
    renderPage([row('a1', true), row('a2', false)], [...burst('a1'), ...burst('a2')]);

    expect(screen.getByRole('tab', { name: 'Live (1)' })).toBeInTheDocument();
  });

  it('flags the same candidate again once the bypass is revoked', () => {
    const { rerender } = renderPage([row('a1', true)], burst('a1'));
    expect(screen.queryByRole('tab', { name: /Live \(/ })).not.toBeInTheDocument();

    mockMonitoring([row('a1', false)], burst('a1'));
    rerender(page());

    expect(screen.getByRole('tab', { name: 'Live (1)' })).toBeInTheDocument();
  });
});

describe('EditExamPage details lock', () => {
  afterEach(() => jest.clearAllMocks());

  it('locks Details and points at Unpublish when published with nobody started yet', () => {
    currentExam = { ...mockExam, status: 'published', hasStartedAttempts: false };
    renderPage([], []);

    expect(screen.getByText(/published, so its details are locked/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeDisabled();
  });

  it('locks Details with the "candidate started" reason once an attempt exists, even while published', () => {
    currentExam = { ...mockExam, status: 'published', hasStartedAttempts: true };
    renderPage([], []);

    expect(screen.getByText(/candidate has already started it/i)).toBeInTheDocument();
    expect(screen.queryByText(/published, so its details are locked/i)).not.toBeInTheDocument();
  });

  it('leaves Details editable once the exam is back to draft (post-unpublish)', () => {
    currentExam = { ...mockExam, status: 'draft', hasStartedAttempts: false };
    renderPage([], []);

    expect(screen.getByLabelText('Title')).not.toBeDisabled();
    expect(screen.queryByText(/its details are locked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/candidate has already started it/i)).not.toBeInTheDocument();
  });
});

describe('EditExamPage Grading tab visibility', () => {
  afterEach(() => jest.clearAllMocks());

  it('hides the Grading tab for an exam that can never produce a code question', () => {
    currentExam = { ...mockExam, requiresManualGrading: false };
    renderPage([], []);

    expect(screen.queryByRole('tab', { name: 'Grading' })).not.toBeInTheDocument();
  });

  it('shows the Grading tab for an exam that could produce a code question', () => {
    currentExam = { ...mockExam, requiresManualGrading: true };
    renderPage([], []);

    expect(screen.getByRole('tab', { name: 'Grading' })).toBeInTheDocument();
  });
});
