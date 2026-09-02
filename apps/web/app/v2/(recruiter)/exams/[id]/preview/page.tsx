'use client';

// v2 Exam preview — printable read-through of an exam's sections + questions. Full re-skin on v2
// primitives; data comes from the exam's own section data (same as the Sections tab) so archived
// attached questions still show. Format only.
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { useExam } from '../../../../../../lib/hooks/useExams';
import type { Question } from '../../../../../../lib/types';
import { dt } from '../../../../../../components/ui-v2';

const backLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none' };
const card: React.CSSProperties = { background: 'var(--paper)', border: '1px solid var(--hair)', borderRadius: 14, padding: 18 };
const QUESTION_TYPE_LABEL: Record<Question['type'], string> = { single_mcq: 'Single choice', multi_mcq: 'Multiple choice', true_false: 'True / False', code: 'Code' };

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div style={{ overflow: 'hidden', borderRadius: 8, marginBottom: 12 }}>
      <div style={{ background: '#1e1e1e', padding: '6px 12px' }}>
        <span style={{ borderRadius: 4, background: '#2d2d2d', padding: '2px 8px', fontSize: 11, fontWeight: 600, color: '#d4d4d4' }}>{lang}</span>
      </div>
      <pre style={{ margin: 0, overflowX: 'auto', background: '#1e1e1e', padding: '8px 12px', fontSize: 12, color: '#d4d4d4' }} className="v2-mono">{code}</pre>
    </div>
  );
}

function PreviewQuestion({ question, index }: { question: Question; index: number }) {
  return (
    <div style={{ ...card, breakInside: 'avoid' }}>
      <span style={{ display: 'block', marginBottom: 8, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
        Q{index + 1} · {QUESTION_TYPE_LABEL[question.type]} · {question.marks} marks
      </span>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{question.text}</p>
      {question.imageUrl && <img src={question.imageUrl} alt="Question illustration" style={{ marginBottom: 12, maxHeight: 256, borderRadius: 10, objectFit: 'contain' }} />}
      {question.snippetCode && <CodeBlock lang={question.snippetLanguage ?? 'plaintext'} code={question.snippetCode} />}
      {question.type === 'code' ? (
        <CodeBlock lang={question.languageMode === 'fixed' ? (question.allowedLanguages[0] ?? 'code') : 'candidate chooses language'} code={question.starterCode || '// No starter code'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {question.options.map((option) => (
            <div key={option.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 8, border: '1px solid var(--hair)', padding: '9px 12px' }}>
              <span style={{ display: 'inline-block', width: 14, height: 14, flexShrink: 0, borderRadius: '50%', border: '2px solid var(--muted)' }} aria-hidden="true" />
              {option.imageUrl && <img src={option.imageUrl} alt="Option illustration" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />}
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>{option.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function V2ExamPreviewPage() {
  const params = useParams<{ id: string }>();
  const { data: exam } = useExam(params.id);
  if (!exam) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Loading…</p>;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Link href={`/v2/exams/${exam.id}/edit`} style={backLink} className="print:hidden"><ArrowLeft size={15} /> Back to Exam</Link>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '10px 0 4px' }}>
        <h1 className="v2-title" style={{ fontSize: 22, margin: 0 }}>{exam.title}</h1>
        <button type="button" onClick={() => window.print()} style={dt.toolBtn} className="print:hidden"><Printer size={14} /> Print</button>
      </div>
      {exam.instructions && <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{exam.instructions}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {exam.sections.slice().sort((a, b) => a.orderIndex - b.orderIndex).map((section) => (
          <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="v2-title" style={{ fontSize: 16, margin: 0 }}>{section.title}</h2>
            {section.selectionMode === 'pool' ? (
              <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Randomly selects {section.poolSize ?? section.questions.length} of {section.questions.length} question{section.questions.length === 1 ? '' : 's'} per candidate{section.poolDifficulty ? ` (difficulty: ${section.poolDifficulty})` : ''}.</p></div>
            ) : section.questions.length === 0 ? (
              <div style={card}><p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No questions added to this section yet.</p></div>
            ) : (
              section.questions.map(({ questionId, question }, index) => question ? <PreviewQuestion key={questionId} question={question} index={index} /> : null)
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
