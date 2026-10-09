import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { InlineAlert } from '../../../components/feedback';
import { TimesheetGrid, type TimesheetDay, type TimesheetLine, type TimesheetStatus } from '../../../components/timesheet';
import { useRun } from '../../org/org-kit';
import { LivePage, MODE_TEXT, addDays, dayText } from './kit';
import type { LoadState, MyTimesheet, TimesheetLineInput } from './types';

// Me › Timesheet (M02 §B7, basic): the week's hours per project and activity on the shared timesheet grid, saved as a
// draft and submitted to the project managers (P03); approved hours set the day in Timesheet mode (D1) and feed
// payroll. Hours of a locked month don't change.

export interface MyTimesheetScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: MyTimesheet | null;
  week: string;
  today: string;
  onWeek: (week: string) => void;
  onSave: (week: string, lines: TimesheetLineInput[]) => Promise<unknown>;
  onSubmit: (week: string) => Promise<unknown>;
  onWithdraw: (id: string) => Promise<unknown>;
}

const STATUS: Record<NonNullable<MyTimesheet['sheet']>['status'], TimesheetStatus> = { draft: 'draft', pending: 'submitted', approved: 'approved', rejected: 'sent_back' };
const local = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export function MyTimesheetScreen(p: MyTimesheetScreenProps) {
  const d = p.data;
  const [lines, setLines] = useState<TimesheetLine[]>([]);
  const { busy, error, run } = useRun();
  useEffect(() => {
    if (d) setLines(d.lines.map((l) => ({ id: l.id, projectId: l.projectId, taskId: l.activity, billable: l.billable, hours: l.minutes.map((m) => (m ? Math.round((m / 60) * 100) / 100 : null)) })));
  }, [d]);
  const input = (): TimesheetLineInput[] => lines.filter((l) => l.projectId).map((l) => ({ projectId: l.projectId!, activity: l.taskId, billable: l.billable, minutes: l.hours.map((h) => Math.round((h ?? 0) * 60)) }));
  const days: TimesheetDay[] = (d?.days ?? []).map((x) => (x.holiday ? { expected: 0, kind: 'holiday', label: x.holiday } : x.leave === 'full' ? { expected: 0, kind: 'leave', label: 'On leave' } : { expected: 0, kind: 'workday' }));
  const locked = (d?.days ?? []).filter((x) => x.locked);
  return (
    <LivePage title="My timesheet" description={d ? `${MODE_TEXT[d.mode] ?? d.mode} · the project manager approves each week` : undefined} state={p.state} onRetry={p.onRetry} what="your timesheet">
      {d && (
        <>
          {d.mode !== 'timesheet' && (
            <InlineAlert tone="info" title="Your days come from your check-ins">
              You can still log project hours here; they don't change your attendance.
            </InlineAlert>
          )}
          {locked.length > 0 && (
            <InlineAlert tone="warning" title="Part of this week is locked">
              {locked.map((x) => dayText(x.on)).join(', ')}: the month is closed, so those hours can't change.
            </InlineAlert>
          )}
          {error && <InlineAlert tone="danger" title="That did not work">{error}</InlineAlert>}
          <TimesheetGrid
            weekStart={local(d.week)}
            days={days}
            status={d.sheet ? STATUS[d.sheet.status] : 'draft'}
            lines={lines}
            onLinesChange={setLines}
            projects={d.projects.map((x) => ({ id: x.id, code: x.code, name: x.name, billable: x.billable, tasks: x.activities.map((a) => ({ id: a, name: a })) }))}
            onPrevWeek={() => p.onWeek(addDays(d.week, -7))}
            onNextWeek={d.week < p.today ? () => p.onWeek(addDays(d.week, 7)) : undefined}
            onSaveDraft={() => void run('save', () => p.onSave(d.week, input()))}
            onSubmit={() =>
              void run('submit', async () => {
                await p.onSave(d.week, input());
                await p.onSubmit(d.week);
              })
            }
            saving={busy === 'save'}
            submitting={busy === 'submit'}
            today={local(p.today)}
          />
          {d.sheet?.status === 'pending' && (
            <div>
              <Button loading={busy === 'withdraw'} onClick={() => void run('withdraw', () => p.onWithdraw(d.sheet!.id))}>
                Withdraw to change it
              </Button>
            </div>
          )}
          {d.recent.length > 0 && (
            <ul className="yx-tim-list" aria-label="Recent weeks">
              {d.recent.map((r) => (
                <li key={r.id} className="yx-tim-row">
                  <Button size="sm" onClick={() => p.onWeek(r.week)}>
                    Week of {dayText(r.week)}
                  </Button>
                  <Badge tone={r.status === 'approved' ? 'success' : r.status === 'pending' ? 'info' : r.status === 'rejected' ? 'danger' : 'neutral'}>{r.status === 'pending' ? 'Waiting' : r.status === 'rejected' ? 'Sent back' : r.status[0].toUpperCase() + r.status.slice(1)}</Badge>
                  <span className="yx-tim-note">{Math.round((r.totalMinutes / 60) * 100) / 100} h</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </LivePage>
  );
}
