'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { StatusBadge, type StatusTone } from './ui';
import { Question, QuestionType, Difficulty } from '../lib/types';

const TYPE_TONE: Record<QuestionType, StatusTone> = {
  single_mcq: 'info',
  multi_mcq: 'info',
  true_false: 'info',
  code: 'purple',
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single_mcq: 'MCQ',
  multi_mcq: 'Multi-select',
  true_false: 'True/False',
  code: 'Code',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// Mirrors the candidate's option lettering so a recruiter reviewing the bank
// sees the same labels the candidate will discuss ("the answer is B").
const OPTION_LETTERS = 'ABCDEFGHIJ';

export function QuestionPreviewCard({ question }: { question: Question }) {
  const options = question.options ?? [];
  const tags = question.tags ?? [];
  const languages = question.allowedLanguages ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={TYPE_TONE[question.type] ?? 'neutral'}>{TYPE_LABEL[question.type] ?? question.type}</StatusBadge>
        <span className="text-xs text-recruiter-text-tertiary">
          {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty} · {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
        </span>
        {question.aiGenerated && <StatusBadge tone="purple">AI</StatusBadge>}
      </div>

      <p className="mb-3 text-sm leading-relaxed text-recruiter-text">{question.text}</p>

      {question.imageUrl && (
        <img src={question.imageUrl} alt="" className="mb-3 max-h-32 self-start rounded border border-recruiter-border object-contain" />
      )}

      {question.type === 'code' ? (
        <p className="rounded-md bg-recruiter-bg-subtle px-2.5 py-2 text-xs text-recruiter-text-secondary">
          Code answer{languages.length > 0 ? ` · ${languages.join(', ')}` : ''}
        </p>
      ) : options.length === 0 ? (
        <p className="text-xs text-recruiter-text-tertiary">No answer options added yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {options.map((option, index) => (
            <li
              key={option.id}
              className={clsx(
                'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                option.isCorrect
                  ? 'border-status-success bg-status-success-bg font-medium text-status-success'
                  : 'border-recruiter-border text-recruiter-text-secondary',
              )}
            >
              <span>
                {OPTION_LETTERS[index] ?? '•'}. {option.text}
              </span>
              {option.isCorrect && <Check size={13} aria-label="Correct answer" className="shrink-0" />}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-recruiter-border pt-2.5 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <span key={tag.id} className="rounded bg-recruiter-bg-subtle px-1.5 py-0.5 text-recruiter-text-tertiary">
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
