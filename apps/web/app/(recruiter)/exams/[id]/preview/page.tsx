'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useExam } from '../../../../../lib/hooks/useExams';
import { useQuestions } from '../../../../../lib/hooks/useQuestions';
import { Card } from '../../../../../components/ui';
import { BackLink } from '../../../../../components/BackLink';
import type { Question } from '../../../../../lib/types';

const QUESTION_TYPE_LABEL: Record<Question['type'], string> = {
  single_mcq: 'Single choice',
  multi_mcq: 'Multiple choice',
  true_false: 'True / False',
  code: 'Code',
};

export default function PreviewPage() {
  const params = useParams<{ id: string }>();
  const { data: exam } = useExam(params.id);
  // ponytail: mirrors SectionQuestionPicker's pageSize:100 workaround -- no
  // fetch-by-ids endpoint exists yet, so orgs with >100 active questions can
  // silently miss some in preview. Same upgrade path as that component.
  const { data: questionsResponse } = useQuestions({ pageSize: 100 });

  const questionsById = useMemo(() => {
    const map = new Map<string, Question>();
    (questionsResponse?.data ?? []).forEach((question) => map.set(question.id, question));
    return map;
  }, [questionsResponse]);

  if (!exam) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    // 672px meant scrolling through a whole paper in a narrow ribbon on a large monitor.
    // Widened, but still capped and centred: this is a read-through of question text, and
    // full-bleed prose across a 2560px screen is harder to review, not easier.
    <div className="mx-auto max-w-4xl xl:max-w-5xl 2xl:max-w-6xl">
      <BackLink href={`/exams/${exam.id}/edit`} label="Back To Exam" />
      <h1 className="mb-2 text-2xl font-semibold text-recruiter-text">{exam.title}</h1>
      {exam.instructions && <p className="mb-6 text-sm text-recruiter-text-secondary">{exam.instructions}</p>}
      <div className="flex flex-col gap-6">
        {exam.sections
          .slice()
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((section) => (
            <div key={section.id} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-recruiter-text">{section.title}</h2>
              {section.selectionMode === 'pool' ? (
                <Card>
                  <p className="text-sm text-recruiter-text-secondary">
                    Randomly selects {section.poolSize ?? section.questions.length} of {section.questions.length} question
                    {section.questions.length === 1 ? '' : 's'} per candidate
                    {section.poolDifficulty ? ` (difficulty: ${section.poolDifficulty})` : ''}.
                  </p>
                </Card>
              ) : section.questions.length === 0 ? (
                <Card>
                  <p className="text-sm text-recruiter-text-secondary">No questions added to this section yet.</p>
                </Card>
              ) : (
                section.questions.map(({ questionId }, index) => {
                  const question = questionsById.get(questionId);
                  return question ? <PreviewQuestion key={questionId} question={question} index={index} /> : null;
                })
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function PreviewQuestion({ question, index }: { question: Question; index: number }) {
  return (
    <Card>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary">
        Q{index + 1} · {QUESTION_TYPE_LABEL[question.type]} · {question.marks} marks
      </span>
      <p className="mb-3 text-sm text-recruiter-text">{question.text}</p>
      {question.imageUrl ? (
        <img src={question.imageUrl} alt="Question illustration" className="mb-3 max-h-64 rounded-lg object-contain" />
      ) : null}
      {question.snippetCode ? (
        <div className="mb-3 overflow-hidden rounded-md">
          <div className="bg-[#1E1E1E] px-3 py-1.5">
            <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-gray-300">
              {question.snippetLanguage ?? 'plaintext'}
            </span>
          </div>
          <pre className="overflow-x-auto bg-[#1E1E1E] px-3 py-2 font-mono text-xs text-gray-300">{question.snippetCode}</pre>
        </div>
      ) : null}
      {question.type === 'code' ? (
        <div className="overflow-hidden rounded-md">
          <div className="bg-[#1E1E1E] px-3 py-1.5">
            <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-gray-300">
              {question.languageMode === 'fixed' ? (question.allowedLanguages[0] ?? 'code') : 'candidate chooses language'}
            </span>
          </div>
          <pre className="overflow-x-auto bg-[#1E1E1E] px-3 py-2 font-mono text-xs text-gray-300">
            {question.starterCode || '// No starter code'}
          </pre>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {question.options.map((option) => (
            <div key={option.id} className="flex items-center gap-2 rounded-md border border-recruiter-border px-3 py-2">
              <span className="inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-recruiter-text-tertiary" aria-hidden="true" />
              {option.imageUrl ? <img src={option.imageUrl} alt="Option illustration" className="h-10 w-10 rounded object-cover" /> : null}
              <span className="text-sm text-recruiter-text">{option.text}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
