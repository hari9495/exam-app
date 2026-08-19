'use client';

import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { CandidateButton } from './CandidateButton';

const PRACTICE_MCQ_OPTIONS = ['10', '12', '14'] as const;
const PRACTICE_CODE_STARTER = 'function sum(a, b) {\n  // try it out — this isn\'t graded\n  return a + b;\n}\n';

export function PracticeStep({ onDone }: { onDone: () => void }) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-candidate-border bg-white p-6">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-candidate-primary">Practice</p>
      <h1 className="mb-3 font-display text-xl font-bold text-candidate-text">Try The Interface Before You Start</h1>
      <p className="mb-4 text-sm text-candidate-text-secondary">
        These two questions aren&apos;t scored or saved — they&apos;re just here so the interface feels familiar
        once the timed exam begins.
      </p>

      <div className="mb-4 rounded-md border border-candidate-border p-3">
        <p className="mb-2 text-sm font-medium text-candidate-text">What is 7 + 5?</p>
        <div className="flex gap-2">
          {PRACTICE_MCQ_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelectedOption(option)}
              className={
                selectedOption === option
                  ? 'rounded-lg border-[1.5px] border-candidate-primary bg-candidate-primary-light px-3 py-2 text-sm font-semibold text-candidate-primary transition-colors'
                  // Matches the real exam's option hover treatment (same gap existed here).
                  : 'rounded-lg border border-candidate-border px-3 py-2 text-sm text-candidate-text-secondary transition-colors hover:border-candidate-primary/40 hover:bg-candidate-bg'
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-md border border-candidate-border p-3">
        <p className="mb-2 text-sm font-medium text-candidate-text">Write a one-line fix for this function (optional)</p>
        {/* Matches the real exam's code-question chrome (traffic lights, language badge, dark
            theme) -- this step exists so the interface "feels familiar" once the timed exam
            starts, which wasn't true while this box looked nothing like the real one. */}
        <div className="overflow-hidden rounded-lg border border-[#2D2D2D]">
          <div className="flex items-center justify-between bg-[#1E1E1E] px-3 py-2">
            <span className="inline-flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
            </span>
            <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">javascript</span>
          </div>
          <Editor
            height="128px"
            defaultLanguage="javascript"
            defaultValue={PRACTICE_CODE_STARTER}
            options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 12 } }}
            theme="vs-dark"
          />
        </div>
        <p className="mt-1 text-xs text-candidate-text-tertiary">
          The real exam includes a Run button to test your code — practice mode is edit-only.
        </p>
      </div>

      <div className="flex justify-between">
        <CandidateButton variant="secondary" onClick={onDone}>
          Skip practice
        </CandidateButton>
        <CandidateButton onClick={onDone}>Continue</CandidateButton>
      </div>
    </div>
  );
}
