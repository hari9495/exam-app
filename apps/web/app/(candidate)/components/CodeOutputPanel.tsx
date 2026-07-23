import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { RunCodeResult } from '../../../lib/hooks/useAttempt';

interface CodeOutputPanelProps {
  result: RunCodeResult | null;
  error: string | null;
}

export function CodeOutputPanel({ result, error }: CodeOutputPanelProps) {
  if (error) {
    return (
      <div className="mt-3 overflow-hidden rounded-lg border border-candidate-danger-border">
        <div className="flex items-center gap-1.5 bg-candidate-danger-bg px-3 py-1.5 text-xs font-bold text-candidate-danger">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Couldn&apos;t run
        </div>
        <div className="bg-white p-3 font-mono text-xs text-candidate-danger">{error}</div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-candidate-border px-3 py-4 text-center text-xs text-candidate-text-faint">
        Click Run to see your output here.
      </div>
    );
  }

  const failed = result.exitCode !== 0;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-candidate-border">
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-1.5 text-xs font-bold',
          failed ? 'bg-candidate-danger-bg text-candidate-danger' : 'bg-candidate-primary-light text-candidate-primary',
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          {failed ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          Exit code: {result.exitCode}
        </span>
      </div>
      <div className="bg-white p-3 font-mono text-xs">
        {result.compileError ? (
          <div className="whitespace-pre-wrap text-candidate-danger">{result.compileError}</div>
        ) : (
          <>
            {result.stdout ? <div className="whitespace-pre-wrap text-candidate-text">{result.stdout}</div> : null}
            {result.stderr ? <div className="whitespace-pre-wrap text-candidate-danger">{result.stderr}</div> : null}
            {result.timedOut ? (
              <div className="text-candidate-review">Your program was stopped for taking too long.</div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
