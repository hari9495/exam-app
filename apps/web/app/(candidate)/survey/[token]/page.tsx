'use client';

// Public candidate survey response page. Un-authed: the per-response token in the URL IS the
// authorization. GET renders the question set; POST submits answers. Mirrors the unsubscribe page.
// Backend: apps/api/src/surveys/public-surveys.controller.ts.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { API_BASE } from '../../../../lib/api-client';
import { CandidateButton } from '../../components/CandidateButton';
import { TerminalCard } from '../../components/TerminalCard';

interface SurveyQuestion {
  type: 'rating' | 'text';
  prompt: string;
}
interface SurveyState {
  orgName: string;
  surveyName: string;
  questions: SurveyQuestion[];
  status: 'pending' | 'submitted';
}

export default function SurveyResponsePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<SurveyState | null>(null);
  const [failed, setFailed] = useState(false);
  const [answers, setAnswers] = useState<(number | string | null)[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/public/surveys/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('not ok');
        return res.json();
      })
      .then((data: SurveyState) => {
        if (!cancelled) {
          setState(data);
          setAnswers(data.questions.map(() => null));
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function setAnswer(i: number, value: number | string | null) {
    setAnswers((prev) => prev.map((a, j) => (j === i ? value : a)));
  }

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/public/surveys/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error('not ok');
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (failed) {
    return <TerminalCard tone="error" title="Invalid link" body="This survey link isn't valid." />;
  }
  if (!state) {
    return <TerminalCard tone="loading" title="Loading" body="This only takes a moment." />;
  }
  if (done || state.status === 'submitted') {
    return <TerminalCard tone="success" title="Thank you" body="Your feedback has been recorded. You can close this page." />;
  }

  return (
    <div className="flex flex-1 items-start justify-center px-8 pb-32 pt-8">
      <div className="candidate-rise w-full max-w-md rounded-lg border border-candidate-border bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_10px_28px_-18px_rgba(16,24,40,0.20)]">
        <h1 className="font-display text-lg font-bold text-candidate-text">{state.surveyName}</h1>
        <p className="mt-1 text-sm text-candidate-text-secondary">{state.orgName} would value your feedback. It only takes a minute.</p>

        <div className="mt-5 flex flex-col gap-5">
          {state.questions.map((q, i) => (
            <div key={i}>
              <label className="text-sm font-medium text-candidate-text">{q.prompt}</label>
              {q.type === 'rating' ? (
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const selected = answers[i] === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setAnswer(i, selected ? null : n)}
                        aria-pressed={selected}
                        className={
                          'h-10 w-10 rounded-lg border text-sm font-medium transition-colors ' +
                          (selected
                            ? 'border-candidate-primary bg-candidate-primary text-candidate-on-primary'
                            : 'border-candidate-border bg-white text-candidate-text hover:bg-candidate-primary-light')
                        }
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={(answers[i] as string) ?? ''}
                  onChange={(e) => setAnswer(i, e.target.value || null)}
                  rows={3}
                  maxLength={5000}
                  className="mt-2 w-full rounded-lg border border-candidate-border bg-white p-3 text-sm text-candidate-text outline-none focus:border-candidate-primary"
                  placeholder="Your answer (optional)"
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6">
          <CandidateButton disabled={submitting} onClick={submit}>
            {submitting ? 'Submitting…' : 'Submit feedback'}
          </CandidateButton>
        </div>
      </div>
    </div>
  );
}
