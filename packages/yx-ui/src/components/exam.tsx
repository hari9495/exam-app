import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import * as RD from '@radix-ui/react-dialog';
import { Check, CheckCircle2, Clock, CloudOff, Flag, Video } from 'lucide-react';
import { cx } from '../lib/cx';
import { formatTime } from '../lib/format';
import { Icon, Spinner } from './foundations';
import { Button } from './button';
import { Checkbox } from './choice';
import { PoweredBy } from './brand';

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export type TimerPhase = 'normal' | 'warning' | 'final';

/** 5 minutes: timer turns warning tone (§40). */
export const EXAM_WARNING_SECONDS = 300;
/** 1 minute: second and last announcement. */
export const EXAM_FINAL_SECONDS = 60;

/** mm:ss; minutes may exceed 59 ("90:00"). Negative values show 00:00. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function timerPhase(seconds: number): TimerPhase {
  if (seconds <= EXAM_FINAL_SECONDS) return 'final';
  if (seconds <= EXAM_WARNING_SECONDS) return 'warning';
  return 'normal';
}

/**
 * Text for the timer's live region. It changes only when a threshold is crossed,
 * so screen readers announce at 5 minutes and at 1 minute and at no other time.
 */
export function timerAnnouncement(seconds: number): string {
  const p = timerPhase(seconds);
  if (p === 'final') return '1 minute left';
  if (p === 'warning') return '5 minutes left';
  return '';
}

export interface ExamQuestionState {
  answered: boolean;
  markedForReview: boolean;
}

export type QuestionStatus = 'answered' | 'not-answered' | 'review';

/** Marked for review wins over answered, so each question has one status and the legend counts add up. */
export function questionStatus(q: ExamQuestionState): QuestionStatus {
  if (q.markedForReview) return 'review';
  return q.answered ? 'answered' : 'not-answered';
}

export interface QuestionCounts {
  answered: number;
  notAnswered: number;
  review: number;
  /** Questions with no answer at all (including ones marked for review): used by the Finish confirmation. */
  unanswered: number;
}

export function countQuestions(qs: ExamQuestionState[]): QuestionCounts {
  const c: QuestionCounts = { answered: 0, notAnswered: 0, review: 0, unanswered: 0 };
  for (const q of qs) {
    const s = questionStatus(q);
    if (s === 'answered') c.answered++;
    else if (s === 'review') c.review++;
    else c.notAnswered++;
    if (!q.answered) c.unanswered++;
  }
  return c;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

export interface ExamTimerProps {
  /** Seconds left. The parent ticks it (server time is the source of truth). */
  seconds: number;
  className?: string;
}

/** Always visible; warning tone from 5 minutes with words, never flashes (§40). */
export function ExamTimer({ seconds, className }: ExamTimerProps) {
  const phase = timerPhase(seconds);
  const words = timerAnnouncement(seconds);
  return (
    <div className={cx('yx-exam-timer', className)} data-phase={phase}>
      <Icon icon={Clock} />
      <span className="yx-exam-timer__clock">
        <span className="yx-visually-hidden">Time left </span>
        {formatClock(seconds)}
      </span>
      {words && (
        <span className="yx-exam-timer__words" aria-hidden="true">
          {words}
        </span>
      )}
      <span className="yx-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {words}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Autosave                                                            */
/* ------------------------------------------------------------------ */

export type AutosaveStatus = 'saving' | 'saved' | 'offline';

export interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  /** "HH:mm" 24-hour, shown 12-hour: "Saved 10:42 am". */
  savedAt?: string;
  className?: string;
}

export function autosaveText(status: AutosaveStatus, savedAt?: string): string {
  if (status === 'saving') return 'Saving…';
  if (status === 'offline') return 'Offline — answers kept on this device, will sync';
  return savedAt ? `Saved ${formatTime(savedAt)}` : 'Saved';
}

export function AutosaveIndicator({ status, savedAt, className }: AutosaveIndicatorProps) {
  return (
    <p className={cx('yx-autosave', className)} data-status={status} role="status" aria-live="polite">
      {status === 'saving' && <Spinner />}
      {status === 'saved' && <Icon icon={CheckCircle2} />}
      {status === 'offline' && <Icon icon={CloudOff} />}
      <span>{autosaveText(status, savedAt)}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Question navigator                                                  */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<QuestionStatus, string> = {
  answered: 'Answered',
  'not-answered': 'Not answered',
  review: 'Marked for review',
};

export interface QuestionNavigatorProps {
  questions: ExamQuestionState[];
  /** 0-based index of the question on screen. */
  current: number;
  onNavigate: (index: number) => void;
  /** Buttons per row, used for Up / Down arrow keys. */
  columns?: number;
  className?: string;
}

/**
 * Grid of numbered buttons. Each state has an icon or shape, not colour alone:
 * answered = filled with a tick, marked for review = flag, not answered = outline, current = thick border + "Current".
 * Arrow keys move between numbers, Home / End jump to first / last, Enter opens the question.
 */
export function QuestionNavigator({ questions, current, onNavigate, columns = 5, className }: QuestionNavigatorProps) {
  const counts = countQuestions(questions);
  const [focus, setFocus] = useState(current);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const headingId = useId();
  const focusIndex = Math.min(focus, questions.length - 1);

  const move = (i: number) => {
    const next = Math.max(0, Math.min(questions.length - 1, i));
    setFocus(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      ArrowDown: i + columns,
      ArrowUp: i - columns,
      Home: 0,
      End: questions.length - 1,
    };
    if (e.key in keys) {
      e.preventDefault();
      move(keys[e.key]);
    }
  };

  return (
    <nav className={cx('yx-qnav', className)} aria-labelledby={headingId}>
      <h2 id={headingId} className="yx-qnav__title">
        Questions
      </h2>
      <ol className="yx-qnav__grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {questions.map((q, i) => {
          const status = questionStatus(q);
          const isCurrent = i === current;
          return (
            <li key={i}>
              <button
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                className="yx-qnav__item"
                data-status={status}
                data-current={isCurrent || undefined}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Question ${i + 1}, ${STATUS_LABEL[status].toLowerCase()}${isCurrent ? ', current' : ''}`}
                tabIndex={i === focusIndex ? 0 : -1}
                onFocus={() => setFocus(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onClick={() => onNavigate(i)}
              >
                <span className="yx-qnav__num">{i + 1}</span>
                {status === 'answered' && <Icon icon={Check} className="yx-qnav__mark" />}
                {status === 'review' && <Icon icon={Flag} className="yx-qnav__mark" />}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="yx-qnav__legend" aria-label="Summary">
        <li>
          <span className="yx-qnav__swatch" data-status="answered" aria-hidden="true">
            <Icon icon={Check} />
          </span>
          Answered <strong>{counts.answered}</strong>
        </li>
        <li>
          <span className="yx-qnav__swatch" data-status="not-answered" aria-hidden="true" />
          Not answered <strong>{counts.notAnswered}</strong>
        </li>
        <li>
          <span className="yx-qnav__swatch" data-status="review" aria-hidden="true">
            <Icon icon={Flag} />
          </span>
          Marked for review <strong>{counts.review}</strong>
        </li>
        <li>
          <span className="yx-qnav__swatch" data-current aria-hidden="true" />
          Current
        </li>
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Question card                                                       */
/* ------------------------------------------------------------------ */

export interface ExamOption {
  id: string;
  label: ReactNode;
}

export interface QuestionCardProps {
  /** 1-based. */
  number: number;
  total: number;
  question: ReactNode;
  /** single = radio buttons, multiple = checkboxes ("Select all that apply"). */
  kind: 'single' | 'multiple';
  options: ExamOption[];
  value: string[];
  onChange: (value: string[]) => void;
  markedForReview: boolean;
  onMarkedForReviewChange: (marked: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Marks shown next to the number, e.g. "2 marks". */
  marks?: ReactNode;
}

/** Sample MCQ card: large targets, "Mark for review", Previous (secondary) / Next (primary). */
export function QuestionCard({
  number,
  total,
  question,
  kind,
  options,
  value,
  onChange,
  markedForReview,
  onMarkedForReviewChange,
  onPrevious,
  onNext,
  marks,
}: QuestionCardProps) {
  const name = useId();
  const toggle = (id: string, checked: boolean) => {
    if (kind === 'single') onChange([id]);
    else onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  };
  return (
    <article className="yx-question">
      <fieldset className="yx-question__set">
        <legend className="yx-question__legend">
          <span className="yx-question__meta">
            Question {number} of {total}
            {marks && <> · {marks}</>}
            {kind === 'multiple' && <> · Select all that apply</>}
          </span>
          <span className="yx-question__text">{question}</span>
        </legend>
        <div className="yx-question__options">
          {options.map((o) => {
            const checked = value.includes(o.id);
            return (
              <label key={o.id} className="yx-question__option" data-checked={checked || undefined}>
                <input
                  type={kind === 'single' ? 'radio' : 'checkbox'}
                  name={name}
                  value={o.id}
                  checked={checked}
                  onChange={(e) => toggle(o.id, e.target.checked)}
                />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="yx-question__foot">
        <Checkbox label="Mark for review" checked={markedForReview} onChange={onMarkedForReviewChange} />
        <div className="yx-question__nav">
          <Button onClick={onPrevious} disabled={!onPrevious}>
            Previous
          </Button>
          <Button variant="primary" onClick={onNext} disabled={!onNext}>
            Next
          </Button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Proctoring notice                                                   */
/* ------------------------------------------------------------------ */

/** Calm, factual strip. Not an alert: no red, no warning icon. */
export function ProctoringNotice({ children = 'Camera on · This test is proctored' }: { children?: ReactNode }) {
  return (
    <p className="yx-proctor-notice">
      <Icon icon={Video} />
      <span>{children}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export interface ExamShellProps {
  testName: string;
  candidateName: string;
  /** Seconds left, see ExamTimer. */
  seconds: number;
  saveStatus: AutosaveStatus;
  savedAt?: string;
  questions: ExamQuestionState[];
  current: number;
  onNavigate: (index: number) => void;
  /** Called after the candidate confirms. */
  onFinish: () => void;
  /** The question card. */
  children: ReactNode;
  /** Tenant logo slot (§38: candidate surfaces carry the tenant brand). */
  logo?: ReactNode;
  /** Shows the proctoring strip under the header. */
  proctored?: boolean;
  whiteLabel?: boolean;
  /** Finish confirmation open state (controlled), for docs and tests. */
  finishOpen?: boolean;
  defaultFinishOpen?: boolean;
  onFinishOpenChange?: (open: boolean) => void;
}

/** Distraction-free full-screen test runner: no sidebar, 16 px body, timer always visible (§40). */
export function ExamShell({
  testName,
  candidateName,
  seconds,
  saveStatus,
  savedAt,
  questions,
  current,
  onNavigate,
  onFinish,
  children,
  logo,
  proctored,
  whiteLabel,
  finishOpen,
  defaultFinishOpen = false,
  onFinishOpenChange,
}: ExamShellProps) {
  const [openState, setOpenState] = useState(defaultFinishOpen);
  const open = finishOpen ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onFinishOpenChange?.(o);
  };
  const counts = countQuestions(questions);

  return (
    <div className="yx-exam">
      <header className="yx-exam__header">
        <div className="yx-exam__id">
          {logo && <span className="yx-exam__logo">{logo}</span>}
          <div className="yx-exam__titles">
            <h1 className="yx-exam__name">{testName}</h1>
            <p className="yx-exam__candidate">{candidateName}</p>
          </div>
        </div>
        <div className="yx-exam__status">
          <AutosaveIndicator status={saveStatus} savedAt={savedAt} />
          <ExamTimer seconds={seconds} />
          <Button onClick={() => setOpen(true)}>
            Finish test
          </Button>
        </div>
      </header>
      {proctored && <ProctoringNotice />}
      <div className="yx-exam__body">
        <main className="yx-exam__main">{children}</main>
        <aside className="yx-exam__aside">
          <QuestionNavigator questions={questions} current={current} onNavigate={onNavigate} />
        </aside>
      </div>
      <footer className="yx-exam__footer">
        <PoweredBy whiteLabel={whiteLabel} />
      </footer>

      <RD.Root open={open} onOpenChange={setOpen}>
        <RD.Portal>
          <RD.Overlay className="yx-exam-confirm__scrim" />
          <RD.Content className="yx-exam-confirm">
            <RD.Title className="yx-exam-confirm__title">Finish the test?</RD.Title>
            <RD.Description asChild>
              <div className="yx-exam-confirm__body">
                {counts.unanswered > 0 ? (
                  <p>
                    You have <strong>{plural(counts.unanswered, 'unanswered question')}</strong>
                    {counts.review > 0 && <> and {plural(counts.review, 'question')} marked for review</>}.
                  </p>
                ) : (
                  <p>
                    You have answered all {questions.length} questions
                    {counts.review > 0 && <>, {plural(counts.review, 'question')} still marked for review</>}.
                  </p>
                )}
                <ul className="yx-exam-confirm__counts">
                  <li>
                    Answered <strong>{counts.answered}</strong>
                  </li>
                  <li>
                    Not answered <strong>{counts.notAnswered}</strong>
                  </li>
                  <li>
                    Marked for review <strong>{counts.review}</strong>
                  </li>
                </ul>
                <p>You can't change your answers after you finish.</p>
              </div>
            </RD.Description>
            <div className="yx-exam-confirm__actions">
              <RD.Close asChild>
                <Button>Keep answering</Button>
              </RD.Close>
              <Button
                variant="primary"
                onClick={() => {
                  setOpen(false);
                  onFinish();
                }}
              >
                Finish test
              </Button>
            </div>
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </div>
  );
}
