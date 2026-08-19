'use client';

import type { QuestionAnalytics } from '../lib/hooks/useQuestions';

// Derived from QuestionAnalytics (itself kept in sync with @exam-platform/shared's FlagSeverity
// by hand -- see the comment on QuestionAnalytics in useQuestions.ts for why this can't just be
// an import) rather than `Record<string, ...>`, so an unrecognised severity is a compile error
// here instead of silently rendering an `undefined` className.
type Severity = QuestionAnalytics['flags'][number]['severity'];

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-slate-300 bg-slate-50 text-slate-700',
};

export function QuestionStatisticsPanel({ analytics }: { analytics: QuestionAnalytics }) {
  if (!analytics.hasEnoughData) {
    return (
      <section className="rounded-md border border-rule p-4">
        <h2 className="text-sm font-medium">Question statistics</h2>
        <p className="mt-2 text-sm text-muted">
          Not enough responses yet ({analytics.responses} of 20). Statistics appear once this question has been answered 20 times.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-rule p-4">
      <h2 className="text-sm font-medium">Question statistics</h2>

      {analytics.flags.map((flag) => (
        <div
          key={flag.code}
          role={flag.severity === 'critical' ? 'alert' : undefined}
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${SEVERITY_STYLES[flag.severity]}`}
        >
          {flag.message}
        </div>
      ))}

      <dl className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div>
          <dt className="text-muted">% correct</dt>
          <dd className="text-lg">{analytics.percentCorrect === null ? '—' : `${Math.round(analytics.percentCorrect * 100)}%`}</dd>
        </div>
        <div>
          <dt className="text-muted">Discrimination</dt>
          {/* Em dash, never 0 -- an undefined correlation is not a weak one. */}
          <dd className="text-lg" data-testid="discrimination">{analytics.discrimination === null ? '—' : analytics.discrimination.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-muted">Responses</dt>
          <dd className="text-lg">{analytics.responses}</dd>
        </div>
      </dl>

      {analytics.options.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <tbody>
            {analytics.options.map((o) => (
              <tr key={o.optionId}>
                <td className="py-1">
                  <span className={o.isCorrect ? 'font-medium text-ink' : 'text-muted'}>
                    {o.isCorrect ? 'Correct answer: ' : 'Distractor: '}
                    {o.text}
                  </span>
                </td>
                <td className="py-1 text-right">
                  {o.selections} ({analytics.responses === 0 ? 0 : Math.round((o.selections / analytics.responses) * 100)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-xs text-muted">
        Includes every submitted attempt, which may contain internal test attempts.
      </p>
    </section>
  );
}
