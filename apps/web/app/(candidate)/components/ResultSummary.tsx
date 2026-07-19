import { AttemptFeedback } from '../../../lib/types';

export function ResultSummary({ feedback }: { feedback: AttemptFeedback }) {
  if (feedback.status === 'pending_review') {
    return <p className="mt-3 text-sm text-candidate-text-secondary">Your code answers are still being reviewed.</p>;
  }
  if (feedback.visibility === 'none') {
    return null;
  }
  return (
    <div className="mt-3 flex flex-col gap-2 text-sm text-candidate-text-secondary">
      {feedback.passFail ? (
        <p className="font-semibold text-candidate-text">{feedback.passFail === 'pass' ? 'Pass' : 'Fail'}</p>
      ) : null}
      {feedback.percentage !== null ? <p>{feedback.percentage.toFixed(1)}%</p> : null}
      {feedback.sections ? (
        <ul className="mt-1 flex flex-col gap-1">
          {feedback.sections.map((section) => (
            <li key={section.title} className="flex justify-between">
              <span>{section.title}</span>
              <span>{section.score}/{section.maxScore}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
