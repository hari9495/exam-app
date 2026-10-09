import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronDown, Circle, Clock, Lock } from 'lucide-react';
import { Button, Link } from './button';
import { Heading, Icon, type IconComponent } from './foundations';
import { Menu, MenuContent, MenuItem, MenuTrigger } from './menu';
import { InlineAlert, Meter } from './feedback';
import { useControllable } from './overlay';

/** True below 768 px (§37), or below `maxWidth + 1` when a wide table needs cards sooner. Shared by the workflow family. */
export function useNarrow(maxWidth = 767) {
  const q = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const h = () => setNarrow(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [q]);
  return narrow;
}

/* ------------------------------------------------------------------ Stepper (§19) */

export type StepStatus = 'done' | 'current' | 'error' | 'locked' | 'todo';

export interface StepperStep {
  id: string;
  title: string;
  /** One short line under the title in the step list. */
  description?: string;
  /** Force a status. Otherwise steps before the current one are done and later ones are to do. */
  status?: 'error' | 'locked' | 'done';
  /** Why the step is locked or what to fix: "Add company details first". */
  statusNote?: string;
  /** The fix for an error step ("Fix LWF registration"), shown as the button in its alert. */
  statusAction?: ReactNode;
  /** The step's form. All steps stay mounted, so Back never loses typed data. */
  content: ReactNode;
  /** What the review step shows for this section. Leave out to skip it in the review. */
  summary?: ReactNode;
}

export interface StepperProps {
  /** Names the process: "Add employee". Labels the step list. */
  title: string;
  steps: StepperStep[];
  current?: string;
  defaultCurrent?: string;
  onCurrentChange?: (id: string) => void;
  /** Validate before moving on. Return false to stay on the step. */
  onContinue?: (id: string) => boolean | void;
  /** Adds the "Save and exit" button (save and resume, §19). */
  onSaveAndExit?: () => void;
  /** Adds a final Review step that summarises every step with an Edit link. */
  review?: { title?: string; description?: string; /** Shown only on the review step, above the summaries: what happens when you finish. */ note?: ReactNode };
  /** Primary action on the last step: "Add employee", "Run payroll". */
  finishLabel: string;
  onFinish?: () => void;
  finishing?: boolean;
  /** Why the final action can't run yet ("Lock September payroll first"). Disables it and says so beside it. */
  finishBlocked?: string;
  /** Why Continue can't run on the current step yet ("Upload a file first"). Disables it and says so beside it. */
  continueBlocked?: string;
  /** Force the phone layout (stories, narrow panels). Default: below 768 px. */
  layout?: 'auto' | 'mobile';
  /** Show the title as the page heading (h1) above the steps, for wizards that are the whole page. */
  showTitle?: boolean;
}

export const REVIEW_ID = 'review';

const STATUS: Record<StepStatus, { icon: IconComponent; text: string }> = {
  done: { icon: Check, text: 'Done' },
  current: { icon: Circle, text: 'In progress' },
  error: { icon: AlertCircle, text: 'Needs changes' },
  locked: { icon: Lock, text: 'Locked' },
  todo: { icon: Circle, text: 'Not started' },
};

/** Vertical wizard for processes with a real order (§19): onboarding, payroll run, company setup. */
export function Stepper({
  title,
  steps: input,
  current,
  defaultCurrent,
  onCurrentChange,
  onContinue,
  onSaveAndExit,
  review,
  finishLabel,
  onFinish,
  finishing,
  finishBlocked,
  continueBlocked,
  layout = 'auto',
  showTitle,
}: StepperProps) {
  const reviewTitle = review?.title ?? 'Review';
  const steps: StepperStep[] = review
    ? [...input, { id: REVIEW_ID, title: reviewTitle, description: review.description ?? 'Check your answers', content: null }]
    : input;
  const [currentId, setCurrent] = useControllable(current, defaultCurrent ?? steps[0].id, onCurrentChange);
  const index = Math.max(0, steps.findIndex((s) => s.id === currentId));
  const [furthest, setFurthest] = useState(index);
  // Below 1024 px the side step list would squeeze the form, so the compact "Step 2 of 6 · All steps" head is used.
  const narrow = useNarrow(1023) || layout === 'mobile';
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const hid = useId();

  useEffect(() => {
    if (index > furthest) setFurthest(index);
    // Move focus to the new step's title so screen readers hear where they are (not on first render).
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusOf = (s: StepperStep, i: number): StepStatus =>
    s.status ?? (i === index ? 'current' : i < index || i <= furthest ? 'done' : 'todo');
  const canOpen = (s: StepperStep, i: number) => s.status !== 'locked' && i <= Math.max(furthest, index);
  // A locked step can't be opened from the list, from Continue or from Back (B7).
  const go = (i: number) => {
    if (steps[i]?.status === 'locked') return;
    setCurrent(steps[i].id);
  };

  const step = steps[index];
  const last = index === steps.length - 1;
  const nextStep = last ? undefined : steps[index + 1];
  // Continue is disabled when the next step is locked, with its reason beside the button.
  const continueReason = continueBlocked ?? (nextStep?.status === 'locked' ? (nextStep.statusNote ?? `${nextStep.title} is locked`) : undefined);
  const next = () => {
    if (continueReason) return;
    if (onContinue?.(step.id) === false) return;
    if (!last) go(index + 1);
  };

  const list = (
    <ol className="yx-stepper__list">
      {steps.map((s, i) => {
        const st = statusOf(s, i);
        const { icon, text } = STATUS[st];
        return (
          <li key={s.id} className="yx-stepper__item" data-status={st}>
            <button
              type="button"
              className="yx-stepper__step"
              aria-current={i === index ? 'step' : undefined}
              disabled={!canOpen(s, i)}
              onClick={() => go(i)}
            >
              <span className="yx-stepper__marker">
                {st === 'todo' || st === 'current' ? <span aria-hidden="true">{i + 1}</span> : <Icon icon={icon} />}
              </span>
              <span className="yx-stepper__text">
                <span className="yx-stepper__title">{s.title}</span>
                {s.description && <span className="yx-stepper__desc">{s.description}</span>}
                <span className="yx-stepper__status">
                  {text}
                  {s.statusNote ? ` · ${s.statusNote}` : ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const mobileHead = (
    <div className="yx-stepper__mhead">
      <p className="yx-stepper__count">
        Step {index + 1} of {steps.length} · {step.title}
      </p>
      <Menu>
        <MenuTrigger asChild>
          <Button size="sm" icon={ChevronDown}>
            All steps
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          {steps.map((s, i) => (
            <MenuItem key={s.id} icon={STATUS[statusOf(s, i)].icon} disabled={!canOpen(s, i)} onSelect={() => go(i)}>
              {i + 1}. {s.title} · {STATUS[statusOf(s, i)].text}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    </div>
  );

  return (
    <div className="yx-stepper" data-layout={narrow ? 'mobile' : 'desktop'}>
      {showTitle && (
        <Heading level={1} className="yx-stepper__pagetitle">
          {title}
        </Heading>
      )}
      {narrow ? mobileHead : <nav aria-label={`${title} steps`} className="yx-stepper__nav">{list}</nav>}
      <section className="yx-stepper__main" aria-labelledby={hid}>
        <header className="yx-stepper__head">
          <Heading level={2} id={hid} ref={headingRef} tabIndex={-1}>
            {step.title}
          </Heading>
          {step.description && <p className="yx-stepper__lead">{step.description}</p>}
        </header>
        {/* On desktop the step list already says what to fix, so the alert shows only when it carries the fix (one alert per message). */}
        {step.status === 'error' && step.statusNote && (narrow || step.statusAction) && (
          <InlineAlert tone="danger" title={step.statusNote} actions={step.statusAction} />
        )}
        {steps.map((s, i) => (
          <div key={s.id} className="yx-stepper__panel" hidden={i !== index}>
            {s.id === REVIEW_ID ? (
              // The note and the summaries are one stack, with the standard gap between them.
              <div className="yx-stepper__review-step">
                {review?.note && <InlineAlert tone="info">{review.note}</InlineAlert>}
                <ReviewList steps={input} onEdit={(id) => setCurrent(id)} />
              </div>
            ) : (
              s.content
            )}
          </div>
        ))}
        <footer className="yx-stepper__foot">
          {onSaveAndExit && <Button onClick={onSaveAndExit}>Save and exit</Button>}
          <span className="yx-stepper__spacer" />
          {index > 0 && <Button onClick={() => go(index - 1)}>Back</Button>}
          {last ? (
            <>
              {finishBlocked && (
                <span className="yx-stepper__blocked" role="status">
                  {finishBlocked}
                </span>
              )}
              <Button variant="primary" loading={finishing} disabled={!!finishBlocked} onClick={() => (onContinue?.(step.id) === false ? undefined : onFinish?.())}>
                {finishLabel}
              </Button>
            </>
          ) : (
            <>
              {continueReason && (
                <span className="yx-stepper__blocked" role="status">
                  {continueReason}
                </span>
              )}
              <Button variant="primary" disabled={!!continueReason} onClick={next}>
                Continue
              </Button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function ReviewList({ steps, onEdit }: { steps: StepperStep[]; onEdit: (id: string) => void }) {
  return (
    <div className="yx-stepper__review">
      {steps
        .filter((s) => s.summary !== undefined)
        .map((s) => (
          <section key={s.id} className="yx-stepper__rsection" aria-label={s.title}>
            <div className="yx-stepper__rhead">
              <Heading level={3}>{s.title}</Heading>
              <Button size="sm" onClick={() => onEdit(s.id)} aria-label={`Edit ${s.title}`}>
                Edit
              </Button>
            </div>
            <div className="yx-stepper__rbody">{s.summary}</div>
          </section>
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ SetupChecklist (§27) */

export interface ChecklistTask {
  id: string;
  title: string;
  description?: string;
  /** "5 min" */
  estimate?: string;
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  /** Optional tasks don't count towards progress and can be skipped. */
  optional?: boolean;
  /** Shown instead of the button when blocked: "Add a bank account first". */
  blockedReason?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  tasks: ChecklistTask[];
}

export interface SetupChecklistProps {
  title?: string;
  sections: ChecklistSection[];
  onStart?: (taskId: string) => void;
  /** Adds "Skip for now" to optional tasks. */
  onSkip?: (taskId: string) => void;
  /** Done tasks are collapsed by default. */
  defaultShowDone?: boolean;
}

/** Progress counts required tasks only. */
export function checklistProgress(sections: ChecklistSection[]) {
  const required = sections.flatMap((s) => s.tasks).filter((t) => !t.optional);
  return { done: required.filter((t) => t.status === 'done').length, total: required.length };
}

const TASK_STATUS: Record<ChecklistTask['status'], { icon: IconComponent; text: string }> = {
  todo: { icon: Circle, text: 'Not started' },
  'in-progress': { icon: Clock, text: 'In progress' },
  done: { icon: Check, text: 'Done' },
  blocked: { icon: Lock, text: 'Blocked' },
};

/** Setup hub checklist with progress (§27, APX-E). */
export function SetupChecklist({ title = 'Set up your company', sections, onStart, onSkip, defaultShowDone = false }: SetupChecklistProps) {
  const [showDone, setShowDone] = useState(defaultShowDone);
  const { done, total } = checklistProgress(sections);
  const doneCount = sections.flatMap((s) => s.tasks).filter((t) => t.status === 'done').length;
  const allDone = done === total;
  const hid = useId();

  return (
    <section className="yx-checklist" aria-labelledby={hid}>
      <header className="yx-checklist__head">
        <Heading level={2} id={hid}>
          {title}
        </Heading>
        <Meter value={done} max={total} label="Setup progress" warnAt={101} dangerAt={101} valueText={`${done} of ${total} done`} />
      </header>
      {allDone && <InlineAlert tone="success" title="Setup is complete. You can change any of these settings later." />}
      {doneCount > 0 && (
        <Button size="sm" className="yx-checklist__toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Hide done tasks' : 'Show done tasks'} ({doneCount})
        </Button>
      )}
      {sections.map((s) => {
        const tasks = s.tasks.filter((t) => showDone || t.status !== 'done');
        return (
          <section key={s.id} className="yx-checklist__section" aria-label={s.title}>
            <Heading level={3}>
              {s.title}{' '}
              <span className="yx-checklist__scount">
                {s.tasks.filter((t) => t.status === 'done').length} of {s.tasks.length} done
              </span>
            </Heading>
            {tasks.length > 0 && (
              <ul className="yx-checklist__tasks">
                {tasks.map((t) => {
                  const st = TASK_STATUS[t.status];
                  return (
                    <li key={t.id} className="yx-checklist__task" data-status={t.status}>
                      <span className="yx-checklist__icon">
                        <Icon icon={st.icon} />
                      </span>
                      <span className="yx-checklist__body">
                        <span className="yx-checklist__title">
                          {t.title}
                          {t.optional && <span className="yx-checklist__opt"> · Optional</span>}
                        </span>
                        {t.description && <span className="yx-checklist__desc">{t.description}</span>}
                        <span className="yx-checklist__meta">
                          {st.text}
                          {t.status === 'blocked' && t.blockedReason ? ` · ${t.blockedReason}` : ''}
                          {t.estimate && t.status !== 'done' ? ` · About ${t.estimate}` : ''}
                        </span>
                      </span>
                      <span className="yx-checklist__actions">
                        {t.optional && onSkip && t.status !== 'done' && (
                          <Link asChild>
                            <button type="button" className="yx-checklist__skip" onClick={() => onSkip(t.id)} aria-label={`Skip ${t.title} for now`}>
                              Skip for now
                            </button>
                          </Link>
                        )}
                        {(t.status === 'todo' || t.status === 'in-progress') && (
                          <Button size="sm" onClick={() => onStart?.(t.id)} aria-label={`${t.status === 'todo' ? 'Start' : 'Continue'} ${t.title}`}>
                            {t.status === 'todo' ? 'Start' : 'Continue'}
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ QuickStartLane (§27) */

export interface QuickStartStep {
  id: string;
  title: string;
  description?: string;
  estimate?: string;
}

export interface QuickStartLaneProps {
  title?: string;
  /** 3 to 5 steps to first value. */
  steps: QuickStartStep[];
  current: string;
  /** Label of the current step's button. Default "Start". */
  actionLabel?: string;
  onAction?: (id: string) => void;
}

/** The 5-minute path to first value, current step highlighted (§27). */
export function QuickStartLane({ title = 'Get started', steps, current, actionLabel = 'Start', onAction }: QuickStartLaneProps) {
  const ci = steps.findIndex((s) => s.id === current);
  const hid = useId();
  return (
    <section className="yx-quickstart" aria-labelledby={hid}>
      <Heading level={3} id={hid}>
        {title}
      </Heading>
      <ol className="yx-quickstart__lane">
        {steps.map((s, i) => {
          const st = i < ci ? 'done' : i === ci ? 'current' : 'todo';
          return (
            <li key={s.id} className="yx-quickstart__step" data-status={st} aria-current={st === 'current' ? 'step' : undefined}>
              <span className="yx-quickstart__num">{st === 'done' ? <Icon icon={Check} /> : <span aria-hidden="true">{i + 1}</span>}</span>
              <span className="yx-quickstart__title">{s.title}</span>
              {s.description && <span className="yx-quickstart__desc">{s.description}</span>}
              <span className="yx-quickstart__status">
                {st === 'done' ? 'Done' : st === 'current' ? 'Next step' : 'Not started'}
                {s.estimate && st !== 'done' ? ` · About ${s.estimate}` : ''}
              </span>
              {st === 'current' && onAction && (
                <Button variant="primary" size="sm" onClick={() => onAction(s.id)}>
                  {actionLabel}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
