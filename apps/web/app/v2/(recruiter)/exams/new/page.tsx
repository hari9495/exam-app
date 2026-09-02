'use client';

// v2 New exam page — thin wrapper around the v2 ExamDetailsForm. Format only, existing hooks.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ExamDetailsForm } from '../ExamDetailsForm';
import { useCreateExam } from '../../../../../lib/hooks/useExams';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };

export default function V2NewExamPage() {
  const router = useRouter();
  const createExam = useCreateExam();
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
      <Link href="/v2/exams" style={backLink}><ArrowLeft size={15} /> Back to Exams</Link>
      <h1 className="v2-title" style={{ fontSize: 22, margin: '10px 0 16px' }}>New exam</h1>
      {error && <div role="alert" style={{ marginBottom: 12, fontSize: 13, padding: '9px 13px', borderRadius: 9, border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)' }}>{error}</div>}
      <ExamDetailsForm
        cancelHref="/v2/exams"
        submitLabel="Create exam" submitting={createExam.isPending}
        onSubmit={(input) => createExam.mutate(input, {
          onSuccess: (created) => router.push(`/v2/exams/${created.id}/edit`),
          onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create exam.'),
        })}
      />
    </div>
  );
}
