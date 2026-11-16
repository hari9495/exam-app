'use client';

import Link from 'next/link';
import { TestRunnerScreen, type LiveRunner } from '@yukthix/ui/assessments';
import { useAttemptQuery, useRunnerActions } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';

// AS-4a (PRC-26): the designed "Test submitted" step, live: what happens next, a link to the result when there is one
// to see (PRC-27, /result), and the optional after-test survey (never affects the score).
const IDLE = { status: 'submitted' as const, seconds: 0, breaksLeft: 0, breakMinutes: 0, connection: 'online' as const, queued: 0, offlineSeconds: 0, offlineMinutes: 0, creditSeconds: 0, creditCapMinutes: 0, saveStatus: 'saved' as const, sections: [], questions: [], current: 0, calculator: 'none' as const, onNavigate: () => undefined, onAnswer: () => undefined, onAnswerText: () => undefined, onMark: () => undefined, onFinish: () => undefined };

export default function CandidateSubmittedPage() {
  const { data: current } = useAttemptQuery();
  const actions = useRunnerActions();
  const state = current && isAttemptStarted(current) ? current : null;
  const feedback = state?.feedback ?? null;
  const resultNote =
    feedback?.status === 'held' ? (
      <p>Your result is under review. You will hear from us by email.</p>
    ) : feedback?.status === 'settled' || feedback?.status === 'invalidated' ? (
      <p>
        <Link href="/result">See your result</Link>
      </p>
    ) : (
      <p>Results: the hiring team will tell you by email.</p>
    );
  const live: LiveRunner = {
    ...IDLE,
    testName: state?.exam.title ?? 'Test',
    candidateName: state?.candidateName ?? '',
    proctored: Boolean(state?.exam.proctoring.enableAntiCheating),
    resultNote,
    survey: state ? { done: Boolean(state.runner?.surveyDone), onSend: actions.sendSurvey } : null,
  };
  return <TestRunnerScreen live={live} />;
}
