import clsx from 'clsx';
import { AttemptFeedback } from '../../../lib/types';

// Renders exactly what the exam's "Candidate feedback" setting permits, and nothing more:
//   none      -> nothing (the submitted page shows only the generic confirmation)
//   pass_fail -> a Pass/Fail badge
//   score     -> Pass/Fail badge + overall percentage
//   breakdown -> the above + a per-section score list
// The backend (buildFeedback) already nulls out whatever a given visibility must hide, so this
// component just renders whichever fields are present. pending_review is handled by the page copy.
export function ResultSummary({ feedback }: { feedback: AttemptFeedback }) {
  if (feedback.status === 'pending_review' || feedback.visibility === 'none') {
    return null;
  }
  const hasResult = feedback.passFail !== null || feedback.percentage !== null || feedback.sections !== null;
  if (!hasResult) {
    return null;
  }

  return (
    <div className="flex flex-col items-stretch gap-3 text-sm">
      {feedback.passFail ? (
        <span
          className={clsx(
            'mx-auto inline-flex items-center rounded px-4 py-1 text-sm font-bold uppercase tracking-wide',
            feedback.passFail === 'pass'
              ? 'bg-candidate-primary-light text-candidate-primary'
              : 'bg-candidate-danger-bg text-candidate-danger',
          )}
        >
          {feedback.passFail === 'pass' ? 'Pass' : 'Fail'}
        </span>
      ) : null}

      {feedback.percentage !== null ? (
        <p className="font-display text-3xl font-bold tabular-nums text-candidate-text">{feedback.percentage.toFixed(1)}%</p>
      ) : null}

      {feedback.sections ? (
        <ul className="mt-1 flex flex-col gap-1.5 text-left">
          {feedback.sections.map((section) => (
            <li
              key={section.title}
              className="flex items-baseline justify-between gap-3 border-b border-candidate-border pb-1.5 last:border-0 last:pb-0"
            >
              <span className="min-w-0 truncate text-candidate-text-secondary">{section.title}</span>
              <span className="shrink-0 font-medium tabular-nums text-candidate-text">
                {section.score}/{section.maxScore}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
