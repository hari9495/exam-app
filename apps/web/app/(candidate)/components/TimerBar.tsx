'use client';

import clsx from 'clsx';
import { Clock } from 'lucide-react';

export type TimerTier = 'ok' | 'warn' | 'danger';

export function timerTier(remainingSeconds: number, totalSeconds: number): TimerTier {
  if (totalSeconds <= 0) return 'ok';
  const fraction = remainingSeconds / totalSeconds;
  if (fraction <= 0.15) return 'danger';
  if (fraction <= 0.5) return 'warn';
  return 'ok';
}

export function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const BADGE_CLASSES: Record<TimerTier, string> = {
  ok: 'bg-candidate-primary-light text-candidate-primary',
  warn: 'bg-candidate-review-bg text-candidate-review',
  danger: 'bg-candidate-danger-bg text-candidate-danger',
};

const FILL_CLASSES: Record<TimerTier, string> = {
  ok: 'bg-candidate-primary',
  warn: 'bg-candidate-review',
  danger: 'bg-candidate-danger',
};

interface TimerBarProps {
  remainingSeconds: number;
  totalSeconds: number;
  // Optional chip rendered beside the timer badge, e.g. "12/20 answered" -- lets the exam
  // page show overall progress without a candidate needing to open the navigator/submit
  // dialog to see it.
  progressLabel?: string;
}

export function TimerBar({ remainingSeconds, totalSeconds, progressLabel }: TimerBarProps) {
  const tier = timerTier(remainingSeconds, totalSeconds);
  const fraction = totalSeconds > 0 ? Math.min(1, Math.max(0, remainingSeconds / totalSeconds)) : 0;

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5">
        {progressLabel ? (
          <span className="inline-flex items-center rounded bg-candidate-bg px-3 py-1 text-xs font-bold text-candidate-text-secondary">
            {progressLabel}
          </span>
        ) : null}
        <span className={clsx('inline-flex items-center gap-1.5 rounded px-3 py-1 font-display text-xs font-bold tabular-nums', BADGE_CLASSES[tier])}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTime(remainingSeconds)} remaining
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-candidate-bg">
        <div
          data-testid="timer-bar-fill"
          className={clsx('h-full rounded-full', FILL_CLASSES[tier])}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
