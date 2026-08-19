'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { StatusBadge } from './ui';
import { QuestionOptionsPreview } from './QuestionOptionsPreview';
import { TYPE_TONE, TYPE_LABEL, DIFFICULTY_LABEL } from '../lib/question-display';
import { Question } from '../lib/types';

export function QuestionListRow({ question }: { question: Question }) {
  const [expanded, setExpanded] = useState(false);
  const tags = question.tags ?? [];

  return (
    <div className="group border-b border-rule last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden="true" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden="true" />
          )}
          {/* Collapsed rows stay one line so the list keeps its density; expanding
              reveals the full wrapped text alongside the answer options. */}
          <span className={clsx('text-sm text-ink', !expanded && 'truncate')}>{question.text}</span>
        </button>
        <StatusBadge tone={TYPE_TONE[question.type] ?? 'neutral'}>{TYPE_LABEL[question.type] ?? question.type}</StatusBadge>
        <span className="hidden w-16 shrink-0 text-xs text-muted sm:block">
          {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
        </span>
        <span className="w-12 shrink-0 text-right text-xs text-muted">{question.marks}</span>
        <Link
          href={`/questions/${question.id}/edit`}
          className="shrink-0 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          Edit
        </Link>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3 pl-9">
          <QuestionOptionsPreview question={question} />
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((tag) => (
                <span key={tag.id} className="rounded bg-ground px-1.5 py-0.5 text-xs text-muted">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
