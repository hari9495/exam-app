'use client';

import Link from 'next/link';
import { StatusBadge } from './ui';
import { QuestionOptionsPreview } from './QuestionOptionsPreview';
import { TYPE_TONE, TYPE_LABEL, DIFFICULTY_LABEL, formatMarks } from '../lib/question-display';
import { Question } from '../lib/types';

export function QuestionPreviewCard({ question }: { question: Question }) {
  const tags = question.tags ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={TYPE_TONE[question.type] ?? 'neutral'}>{TYPE_LABEL[question.type] ?? question.type}</StatusBadge>
        <span className="text-xs text-muted">
          {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty} · {formatMarks(question.marks)}
        </span>
        {question.aiGenerated && <StatusBadge tone="purple">AI</StatusBadge>}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-ink">{question.text}</p>

      {question.imageUrl && (
        <img src={question.imageUrl} alt="" className="mb-3 max-h-32 self-start rounded border border-rule object-contain" />
      )}

      <QuestionOptionsPreview question={question} />

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-rule pt-2.5 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <span key={tag.id} className="rounded bg-ground px-1.5 py-0.5 text-muted">
              {tag.name}
            </span>
          ))}
        </div>
        <Link
          href={`/questions/${question.id}/edit`}
          className="shrink-0 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}
