'use client';

// v2 Edit question page — v2 QuestionForm + (reused) stats/audit panels. Format only, existing hooks.
// QuestionStatisticsPanel + AuditHistoryLink are the existing components for now (v2 restyle later).
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { QuestionForm } from '../../QuestionForm';
import { useQuestion, useUpdateQuestion, useTags, useQuestionAnalytics } from '../../../../../../lib/hooks/useQuestions';
import { QuestionStatisticsPanel } from '../../../../../../components/QuestionStatisticsPanel';
import { AuditHistoryLink } from '../../../../../../components/AuditHistoryLink';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };

export default function V2EditQuestionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: question } = useQuestion(params.id);
  const { data: tags } = useTags();
  const { data: analytics } = useQuestionAnalytics(params.id);
  const updateQuestion = useUpdateQuestion(params.id);
  const [error, setError] = useState<string | null>(null);

  if (!question) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/v2/questions" style={backLink}><ArrowLeft size={15} /> Back to Question Bank</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '10px 0 16px' }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>Edit question</h1>
        <AuditHistoryLink entityType="question" entityId={question.id} entityName={question.text} />
      </div>
      {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)' }}>{error}</div>}
      <QuestionForm
        initialQuestion={question} tags={tags ?? []} submitLabel="Save changes" submitting={updateQuestion.isPending}
        onSubmit={(input) => updateQuestion.mutate(input, {
          onSuccess: () => router.push('/v2/questions'),
          onError: (e) => setError(e instanceof Error ? e.message : 'Failed to update question.'),
        })}
      />
      {analytics && <div style={{ marginTop: 24 }}><QuestionStatisticsPanel analytics={analytics} /></div>}
    </div>
  );
}
