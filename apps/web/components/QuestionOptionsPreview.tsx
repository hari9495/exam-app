'use client';

import { Check } from 'lucide-react';
import clsx from 'clsx';
import { Question } from '../lib/types';

// Mirrors the candidate's option lettering so a recruiter reviewing the bank
// sees the same labels the candidate will discuss ("the answer is B").
const OPTION_LETTERS = 'ABCDEFGHIJ';

export function QuestionOptionsPreview({ question }: { question: Question }) {
  const options = question.options ?? [];
  const languages = question.allowedLanguages ?? [];

  if (question.type === 'code') {
    return (
      <p className="rounded-md bg-ground px-2.5 py-2 text-xs text-muted">
        Code answer{languages.length > 0 ? ` · ${languages.join(', ')}` : ''}
      </p>
    );
  }

  if (options.length === 0) {
    return <p className="text-xs text-muted">No answer options added yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {options.map((option, index) => (
        <li
          key={option.id}
          className={clsx(
            'flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs',
            option.isCorrect
              ? 'border-status-success bg-status-success-bg font-medium text-status-success'
              : 'border-rule text-muted',
          )}
        >
          <span>
            {OPTION_LETTERS[index] ?? '•'}. {option.text}
          </span>
          {option.isCorrect && <Check size={13} aria-label="Correct Answer" className="shrink-0" />}
        </li>
      ))}
    </ul>
  );
}
