// PPL-47 My checklist tasks · PPL-48 Life events (designed 20 Oct 2026 in the PPL-13 style, M01 §3.5, design §7.5):
// the tasks given to me or my team across every joiner, leaver and life event, and the running life-event checklists.
import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../../components/button';
import { Badge } from '../../components/display';
import { EmptyState, ErrorState, NoAccessState, InlineAlert, Meter } from '../../components/feedback';
import { Icon, Text } from '../../components/foundations';
import { PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { formatDate } from '../../lib/format';
import { daysBetween } from './people-logic';
import { ListSkeleton, PeopleFrame, StatusChecklist, type ChecklistRow } from './people-kit';
import { CONTENT_ASK, TaskDialog, type TaskActions, type TaskAsk } from './live/lifecycle';
import { JOURNEY_KIND_LABEL, type JourneyKind, type JourneyTask, type LifeJourneyRow } from './live/types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string) => new Date(`${iso}T00:00:00`);
const ANCHOR: Record<JourneyKind, string> = { onboarding: 'joins', offboarding: 'leaves', new_manager: 'manages from', transfer: 'moves', parental_leave: 'leave from', return_to_work: 'back on' };

/** The buttons a task offers the viewer: do it (its kind decides the words), upload, issue the letter, skip. */
export function taskButtons(t: JourneyTask, onAsk: (a: TaskAsk) => void, opts: { manage: boolean; actions: TaskActions }): ReactNode {
  if (t.status === 'done' || t.status === 'skipped' || t.status === 'cancelled') return undefined;
  const out: ReactNode[] = [];
  if (t.canComplete) out.push(<Button key="do" size="sm" onClick={() => onAsk({ kind: CONTENT_ASK[t.kind]?.ask ?? 'done', task: t })}>{CONTENT_ASK[t.kind]?.button ?? 'Mark done'}</Button>);
  if (opts.manage && opts.actions.onIssueLetter && t.kind === 'letter' && t.status === 'open') out.push(<Button key="letter" size="sm" onClick={() => onAsk({ kind: 'letter', task: t })}>Issue letter</Button>);
  if (opts.manage && opts.actions.onUpload && t.kind === 'document' && t.status === 'open') out.push(<Button key="up" size="sm" onClick={() => onAsk({ kind: 'upload', task: t })}>Upload</Button>);
  if (t.canSkip) out.push(<Button key="skip" size="sm" onClick={() => onAsk({ kind: 'skip', task: t })}>Skip</Button>);
  if (t.status === 'waiting' && !out.length) out.push(<Button key="wait" size="sm" disabled>Mark done</Button>);
  return out.length ? <>{out}</> : undefined;
}

/** One task as a checklist row (PPL-13 style): title, the law badge, owner, due day, status and buttons. */
export function taskRow(t: JourneyTask, when: string | undefined, action: ReactNode): ChecklistRow {
  return {
    id: t.id,
    title: (
      <span className="yx-ppl__row">
        {t.title}
        {t.locked && (
          <Badge tone="neutral">
            <Icon icon={Lock} size="sm" /> Required by law
          </Badge>
        )}
      </span>
    ),
    owner: t.assignee ?? t.ownerLabel,
    due: day(t.dueOn),
    when,
    status: t.status === 'done' ? 'Done' : t.status === 'skipped' ? 'Skipped' : t.status === 'waiting' ? 'Blocked' : 'Pending',
    note: t.status === 'waiting' ? 'Waiting for an earlier task' : t.status === 'skipped' && t.skipReason ? t.skipReason : t.status === 'done' && t.completedBy ? `Done by ${t.completedBy}` : undefined,
    action,
  };
}

/* ================================================================== PPL-47 my checklist tasks */

export interface MyChecklistTasksProps {
  tasks: JourneyTask[];
  today: Date;
  state?: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  /** Do, upload, issue, skip (live). Stories leave it out: the buttons show but do nothing. */
  actions?: TaskActions;
  onOpen?: (journeyId: string) => void;
  /** lifecycle.onboarding.manage: Upload and Issue letter on HR's rows, as on the journey record (PPL-47). */
  canManage?: boolean;
}

// PPL-47
export function MyChecklistTasks({ tasks, today, state = 'ready', onRetry, actions, onOpen, canManage = false }: MyChecklistTasksProps) {
  const [ask, setAsk] = useState<TaskAsk | null>(null);
  const noop: TaskActions = { onComplete: async () => undefined, onSkip: async () => undefined };
  const acts = actions ?? noop;
  const overdue = tasks.filter((t) => t.overdue).length;
  // One group per checklist, the one with the earliest due task first.
  const groups = [...new Set(tasks.map((t) => t.journeyId ?? t.id))]
    .map((id) => tasks.filter((t) => (t.journeyId ?? t.id) === id).sort((a, b) => a.dueOn.localeCompare(b.dueOn)))
    .sort((a, b) => a[0].dueOn.localeCompare(b[0].dueOn));
  return (
    <PeopleFrame active="My checklist tasks">
      <PageHeader
        title="My checklist tasks"
        description={
          tasks.length === 0
            ? 'Tasks for joiners, leavers and life events given to you or your team.'
            : `${plural(tasks.length, 'task')} for ${plural(groups.length, 'person', 'people')}${overdue ? `, ${overdue} overdue` : ''}. Soonest due first.`
        }
      />
      {state === 'error' ? (
        <ErrorState title="We couldn't load your tasks" description="Check your connection and try again." onRetry={onRetry} />
      ) : state === 'loading' ? (
        <ListSkeleton label="Loading your tasks" />
      ) : tasks.length === 0 ? (
        <EmptyState title="Nothing to do" description="When a joiner, leaver or life event gives you or your team a task, it appears here." />
      ) : (
        <>
          {overdue > 0 && <InlineAlert tone="warning">{plural(overdue, 'task is', 'tasks are')} past the due date.</InlineAlert>}
          <div className="yx-ppl__phases">
            {groups.map((g) => {
              const first = g[0];
              const kind = first.journeyKind ?? 'onboarding';
              const anchor = first.anchorOn ? day(first.anchorOn) : null;
              const head = `phase-${first.journeyId ?? first.id}`;
              return (
                <section key={head} aria-labelledby={head}>
                  <div className="yx-ppl__phase-head">
                    <h2 className="yx-ppl__phase-title" id={head}>
                      {first.person ?? 'Someone'} · {JOURNEY_KIND_LABEL[kind].toLowerCase()}
                    </h2>
                    <span className="yx-ppl__row">
                      {anchor && (
                        <Text size="sm" tone="secondary">
                          {ANCHOR[kind]} {formatDate(anchor)}
                        </Text>
                      )}
                      {onOpen && first.journeyId && (
                        <Button size="sm" onClick={() => onOpen(first.journeyId!)}>
                          Open checklist
                        </Button>
                      )}
                    </span>
                  </div>
                  <StatusChecklist label={`Tasks for ${first.person ?? 'this person'}`} rows={g.map((t) => taskRow(t, undefined, taskButtons(t, setAsk, { manage: canManage, actions: acts })))} today={today} />
                </section>
              );
            })}
          </div>
        </>
      )}
      {ask && <TaskDialog ask={ask} actions={acts} onClose={() => setAsk(null)} />}
    </PeopleFrame>
  );
}

/* ================================================================== PPL-48 life events */

export interface LifeEventsListProps {
  rows: LifeJourneyRow[];
  today: Date;
  state?: 'ready' | 'loading' | 'error' | 'no-access';
  onRetry?: () => void;
  onOpen?: (journeyId: string) => void;
}

// PPL-48
export function LifeEventsList({ rows, today, state = 'ready', onRetry, onOpen }: LifeEventsListProps) {
  const cols: TableColumn<LifeJourneyRow>[] = [
    { key: 'person', header: 'Person', type: 'person', value: (r) => r.person, person: (r) => ({ name: r.person, secondary: r.kindLabel }), width: 260 },
    { key: 'kind', header: 'Life event', value: (r) => r.kindLabel, groupable: true, width: 170 },
    {
      key: 'on',
      header: 'Day',
      type: 'date',
      value: (r) => day(r.anchorOn),
      render: (r) => {
        const n = daysBetween(today, day(r.anchorOn));
        return (
          <span className="yx-ppl__row">
            {formatDate(day(r.anchorOn))}
            <Badge tone={n >= 0 && n <= 7 ? 'warning' : 'neutral'}>{n === 0 ? 'today' : n > 0 ? `in ${plural(n, 'day')}` : `${plural(-n, 'day')} ago`}</Badge>
          </span>
        );
      },
      width: 210,
    },
    { key: 'progress', header: 'Required tasks done', type: 'number', value: (r) => r.progress, render: (r) => <Meter value={r.progress} max={100} label={`${r.person}: required tasks done`} valueText={`${r.progress}%`} warnAt={101} dangerAt={101} />, width: 180 },
  ];
  return (
    <PeopleFrame active="Life events">
      <PageHeader title="Life events" description="Checklists for new managers, transfers, parental leave and return to work. Each starts by itself once the company turns it on in Settings › Checklists." />
      {state === 'no-access' ? (
        <NoAccessState what="the life-event checklists" grantedBy="your HR admin" />
      ) : state === 'error' ? (
        <ErrorState title="We couldn't load the life-event checklists" description="Check your connection and try again." onRetry={onRetry} />
      ) : state === 'loading' ? (
        <ListSkeleton label="Loading life-event checklists" />
      ) : (
        <DataTable
          label="Life-event checklists"
          columns={cols}
          rows={rows}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'on', dir: 'asc' }}
          {...(onOpen ? { onRowClick: (r: LifeJourneyRow) => onOpen(r.id) } : {})}
          rowButtons={(r) => <Button size="sm" onClick={() => onOpen?.(r.id)}>Open checklist</Button>}
          empty={<EmptyState title="No life-event checklists running" description="Turn one on in Settings › Checklists › Life events. New managers, transfers, parental leave and returns then start their checklist by themselves." />}
        />
      )}
    </PeopleFrame>
  );
}
