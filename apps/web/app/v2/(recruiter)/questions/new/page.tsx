'use client';

// v2 New question page — thin wrapper around the v2 QuestionForm. Format only, existing hooks.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { QuestionForm } from '../QuestionForm';
import { useCreateQuestion, useTags } from '../../../../../lib/hooks/useQuestions';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };

export default function V2NewQuestionPage() {
  const router = useRouter();
  const { data: tags } = useTags();
  const createQuestion = useCreateQuestion();
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 720 }}>
      <Link href="/v2/questions" style={backLink}><ArrowLeft size={15} /> Back to Question Bank</Link>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '10px 0 16px' }}>New question</h1>
      {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)' }}>{error}</div>}
      <QuestionForm
        tags={tags ?? []} submitLabel="Create question" submitting={createQuestion.isPending}
        onSubmit={(input) => createQuestion.mutate(input, {
          onSuccess: () => router.push('/v2/questions'),
          onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create question.'),
        })}
      />
    </div>
  );
}
