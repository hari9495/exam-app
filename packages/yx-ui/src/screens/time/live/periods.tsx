import { useEffect, useState } from 'react';
import { Button } from '../../../components/button';
import { Badge } from '../../../components/display';
import { Drawer } from '../../../components/drawer';
import { EmptyState, InlineAlert, Skeleton } from '../../../components/feedback';
import { ErrorSummary, FormField, useSaveErrors } from '../../../components/field';
import { TextArea } from '../../../components/inputs';
import { Select } from '../../../components/select';
import { Card } from '../../../components/shell';
import { useRun } from '../../org/org-kit';
import { LivePage, MODE_TEXT, dateText } from './kit';
import type { LoadState, PayrollFeed, Periods, Preflight, Registers } from './types';

// P08 attendance periods (lock / unlock per legal entity and month, with a fresh second sign-in step and the
// pre-flight), the statutory registers per establishment (P07 formats; the law's columns are always there), and the
// payroll feed, read only (frozen at the lock; a live preview before it).

const monthText = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};
const hours = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;

// ------------------------------------------------------------------------------------------ payroll feed

export interface PayrollFeedScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: PayrollFeed | null;
  entities: { id: string; name: string }[];
  entityId: string | null;
  onEntity: (id: string) => void;
  month: string;
  onMonth: (month: string) => void;
}

export function PayrollFeedScreen(p: PayrollFeedScreenProps) {
  const d = p.data;
  return (
    <LivePage
      title="Payroll feed"
      description="What payroll will read for each person and month. Read only: it is frozen when the month is locked."
      state={p.entityId ? p.state : 'ready'}
      onRetry={p.onRetry}
      what="the payroll feed"
      actions={
        <div className="yx-tim-row">
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, -1))}>
            Previous month
          </Button>
          <Button size="sm" onClick={() => p.onMonth(shiftMonth(p.month, 1))}>
            Next month
          </Button>
        </div>
      }
    >
      <FormField id="pf-entity" label="Legal entity">
        <Select value={p.entityId} onChange={(v) => v && p.onEntity(v)} options={p.entities.map((e) => ({ value: e.id, label: e.name }))} />
      </FormField>
      {d && (
        <Card title={`${d.entity.name} · ${monthText(d.month)}`} actions={d.frozen ? <Badge tone="neutral">Frozen {d.lockedAt ? dateText(d.lockedAt.slice(0, 10)) : ''}</Badge> : <Badge tone="warning">Preview: the month is open</Badge>}>
          {d.rows.length ? (
            <div className="yx-tim-grid">
              <table aria-label="Payroll feed">
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Mode</th>
                    <th scope="col">Days</th>
                    <th scope="col">Paid days</th>
                    <th scope="col">Loss of pay</th>
                    <th scope="col">OT working day</th>
                    <th scope="col">OT weekly off</th>
                    <th scope="col">OT holiday</th>
                    <th scope="col">Night shifts</th>
                    <th scope="col">Comp-off</th>
                    <th scope="col">Timesheet</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.employeeId}>
                      <th scope="row">
                        {r.name}
                        {r.code ? ` (${r.code})` : ''}
                      </th>
                      <td>{MODE_TEXT[r.mode] ?? r.mode}</td>
                      <td>
                        {r.calendarDays}
                        {r.unevaluatedDays ? ` (${r.unevaluatedDays} not worked out)` : ''}
                      </td>
                      <td>{r.paidDays}</td>
                      <td>{r.lopDays}</td>
                      <td>{hours(r.otNormalMinutes)}</td>
                      <td>{hours(r.otWeeklyOffMinutes)}</td>
                      <td>{hours(r.otHolidayMinutes)}</td>
                      <td>{r.nightShifts}</td>
                      <td>{r.compOffDays}</td>
                      <td>{hours(r.timesheetMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact title="No one in your scope for this month" />
          )}
        </Card>
      )}
    </LivePage>
  );
}
