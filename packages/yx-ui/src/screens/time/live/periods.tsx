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

// ------------------------------------------------------------------------------------------ registers

export interface RegistersScreenProps {
  state: LoadState;
  onRetry?: () => void;
  data: Registers | null;
  month: string;
  onMonth: (month: string) => void;
  onDownload: (type: 'muster' | 'leave', locationId: string, format: 'pdf' | 'xlsx') => Promise<unknown>;
}

const STATE_TEXT: Record<string, string> = { 'IN-KA': 'Karnataka', 'IN-TN': 'Tamil Nadu' };

export function RegistersScreen(p: RegistersScreenProps) {
  const d = p.data;
  const { busy, error, run } = useRun();
  return (
    <LivePage
      title="Registers"
      description="The muster and leave registers each establishment keeps, in its state's format. Every column the law asks for is always there."
      state={p.state}
      onRetry={p.onRetry}
      what="registers"
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
      {d && (
        <>
          {error && <InlineAlert tone="danger" title="Not downloaded">{error}</InlineAlert>}
          {d.locations.map((l) => (
            <Card key={l.id} title={`${l.name} · ${monthText(d.month)}`} actions={l.locked ? <Badge tone="neutral">Month locked</Badge> : <Badge tone="warning">Draft: month not locked</Badge>}>
              <div className="yx-tim-stack">
                <p className="yx-tim-note">
                  {l.entity} · {STATE_TEXT[l.state] ?? l.state} · {l.people} people{l.verify ? ' · formats to be confirmed by your compliance adviser' : ''}
                </p>
                {l.formats.length ? (
                  l.formats.map((f) => (
                    <div key={f.type} className="yx-tim-row">
                      <span className="yx-tim-list__main">
                        <span>{f.title}</span>
                        <span className="yx-tim-note">{f.form}</span>
                      </span>
                      {(['pdf', 'xlsx'] as const).map((fmt) => (
                        <Button key={fmt} size="sm" loading={busy === `${l.id}-${f.type}-${fmt}`} onClick={() => void run(`${l.id}-${f.type}-${fmt}`, () => p.onDownload(f.type, l.id, fmt))}>
                          Download {fmt === 'pdf' ? 'PDF' : 'Excel'}
                        </Button>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="yx-tim-muted">No register format for this state yet.</p>
                )}
              </div>
            </Card>
          ))}
          {!d.locations.length && <EmptyState title="No establishments in your scope this month" />}
        </>
      )}
    </LivePage>
  );
}

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
