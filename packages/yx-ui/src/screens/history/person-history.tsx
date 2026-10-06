import { useState } from 'react';
import { Badge } from '../../components/display';
import { Button } from '../../components/button';
import { DatePicker } from '../../components/date';
import { EmptyState, ErrorState, InlineAlert, NoAccessState, Skeleton } from '../../components/feedback';
import { FormField } from '../../components/field';
import { Text } from '../../components/foundations';
import { Select } from '../../components/select';
import { Breadcrumbs, Card, ObjectHeader, PageHeader } from '../../components/shell';
import { DataTable, type TableColumn } from '../../components/table';
import { dayKey } from '../../lib/dates';
import { dateLabel, useRun } from '../org/org-kit';
import { ChangeDrawer, ChangeStatusBadge, money, STATUS_LABEL, TYPE_LABEL, WhenBadge } from './history-kit';
import type { AsOfView, ChangeInput, ChangeOptions, ChangeRecord, HistoryView, Impact, LoadState, PersonOption } from './types';

// People › Job history (P06 §4.7, §7; PPL-03 History tab): the record as on any date, past or scheduled,
// with every change and every correction. Pay only for pay access and only after "Show pay" (R1).

export interface PersonHistoryScreenProps {
  state: LoadState;
  onRetry?: () => void;
  people: PersonOption[];
  personId: string | null;
  onPickPerson: (id: string) => void;
  today: string;
  asOf: string;
  onAsOf: (date: string) => void;
  /** null while the chosen person loads. */
  view: AsOfView | null;
  history: HistoryView | null;
  payShown: boolean;
  onShowPay: (show: boolean) => Promise<void>;
  /** employee.change.manage: the "Change" button. */
  change?: { options: ChangeOptions; onPreview: (input: ChangeInput) => Promise<Impact>; onSubmit: (input: ChangeInput) => Promise<void> };
}

const range = (from: string, to: string | null) => (to ? `${dateLabel(from)} – ${dateLabel(to)}` : `From ${dateLabel(from)}`);

export function PersonHistoryScreen({ state, onRetry, people, personId, onPickPerson, today, asOf, onAsOf, view, history, payShown, onShowPay, change }: PersonHistoryScreenProps) {
  const [changing, setChanging] = useState(false);
  const { busy, error, run } = useRun();
  const person = people.find((p) => p.id === personId);
  const a = view?.assignment;
  const corrected = history?.assignment.filter((r) => r.supersededAt && r.supersededBy?.type === 'correction') ?? [];
  const columns: TableColumn<ChangeRecord>[] = [
    {
      key: 'change',
      header: 'What changed',
      value: (c) => c.changeType,
      render: (c) => (
        <span className="yx-auth__item-main">
          <Text weight="medium">{TYPE_LABEL[c.changeType]}</Text>
          <Text tone="secondary" size="sm">{c.reason}</Text>
        </span>
      ),
      hideable: false,
    },
    {
      key: 'when',
      header: 'Takes effect',
      value: (c) => c.effectiveDate,
      render: (c) => (
        <span className="yx-auth__item-main">
          <Text>{dateLabel(c.effectiveDate)}</Text>
          {c.status !== 'rejected' && c.status !== 'cancelled' && <WhenBadge date={c.effectiveDate} today={today} />}
        </span>
      ),
      width: 150,
    },
    {
      key: 'status',
      header: 'Status',
      value: (c) => c.status,
      render: (c) => (
        <span className="yx-hist__badges">
          <ChangeStatusBadge status={c.status} />
          {c.retro && c.changeType !== 'join' && <Badge tone="warning">Changes the past</Badge>}
        </span>
      ),
      width: 170,
      optional: true,
    },
  ];
  return (
    <div className="yx-auth__page">
      <PageHeader breadcrumbs={<Breadcrumbs items={[{ label: 'People' }, { label: 'Job history' }]} />} title="Job history" description="What was true on any date, what is scheduled, and every correction." />
      {state === 'loading' && <Skeleton height={240} />}
      {state === 'error' && <ErrorState title="We couldn't load the people you can see." description="Nothing has changed. Try again in a moment." onRetry={onRetry} />}
      {state === 'no-access' && <NoAccessState grantedBy="HR" what="job history" />}
      {state === 'ready' && (
        <>
          <FormField label="Person">
            <Select value={personId} onChange={(id) => id && onPickPerson(id)} options={people.map((p) => ({ value: p.id, label: `${p.name}${p.employeeCode ? ` · ${p.employeeCode}` : ''}` }))} searchable placeholder="Choose a person" aria-label="Person" />
          </FormField>
          {!personId && <EmptyState title={people.length ? 'Choose a person to see their job history.' : 'Nobody to show yet.'} description={people.length ? 'You see yourself and the people who report to you; HR sees everyone.' : 'People appear here once HR adds them.'} />}
          {personId && !view && <Skeleton height={320} />}
          {personId && view && (
            <>
              <ObjectHeader
                person
                photoUrl={null}
                name={view.employee.name}
                secondary={a ? [a.designation?.name, a.department?.name].filter(Boolean).join(' · ') : 'No assignment on this date'}
                status={view.status ? <Badge tone={view.status.status === 'probation' ? 'warning' : 'neutral'}>{STATUS_LABEL[view.status.status]}</Badge> : undefined}
                facts={[
                  { label: 'Employee code', value: view.employee.employeeCode },
                  { label: 'Legal entity', value: view.employee.legalEntity?.name ?? '—' },
                  { label: 'Joined', value: dateLabel(view.employee.joinedOn) },
                ]}
                actions={
                  <>
                    {view.payAccess && (
                      <Button loading={busy === 'pay'} onClick={() => void run('pay', () => onShowPay(!payShown))}>{payShown ? 'Hide pay' : 'Show pay'}</Button>
                    )}
                    {change && person && <Button variant="primary" onClick={() => setChanging(true)}>Change</Button>}
                  </>
                }
              />
              {error && <InlineAlert tone="danger">{error}</InlineAlert>}
              <div className="yx-hist__asof">
                <FormField label="View as on">
                  <DatePicker value={new Date(`${asOf}T00:00:00`)} onChange={(d) => d && onAsOf(dayKey(d))} aria-label="View as on" />
                </FormField>
                {asOf !== today && <Button onClick={() => onAsOf(today)}>Back to today</Button>}
                {asOf > today && <Badge tone="info">Includes scheduled changes</Badge>}
              </div>
              <Card title={asOf === today ? 'Today' : `As on ${dateLabel(asOf)}`}>
                {a ? (
                  <dl className="yx-hist__facts">
                    <dt>Designation</dt>
                    <dd>{a.designation?.name ?? '—'}</dd>
                    <dt>Grade</dt>
                    <dd>{a.grade?.name ?? '—'}</dd>
                    <dt>Department</dt>
                    <dd>{a.department?.name ?? '—'}</dd>
                    <dt>Location</dt>
                    <dd>{a.location.name ?? '—'}</dd>
                    <dt>Manager</dt>
                    <dd>{a.manager?.name ?? 'None'}</dd>
                    <dt>Employment type</dt>
                    <dd>{a.employmentType?.name ?? '—'}</dd>
                    <dt>Cost centres</dt>
                    <dd>{a.costCentres.length ? a.costCentres.map((c) => `${c.name ?? c.code} ${Number(c.percent)}%`).join(', ') : '—'}</dd>
                    {payShown && (
                      <>
                        <dt>Annual CTC</dt>
                        <dd>{view.compensation ? money(view.compensation.annualCtc, view.compensation.currency) : 'Not set'}</dd>
                      </>
                    )}
                    <dt>Since</dt>
                    <dd>{range(a.validFrom, a.validTo)}</dd>
                  </dl>
                ) : (
                  <EmptyState compact title="Not employed on this date." description={`Joined on ${dateLabel(view.employee.joinedOn)}.`} />
                )}
              </Card>
              <Card title="Changes">
                {history ? (
                  <DataTable label="Changes" columns={columns} rows={[...history.changes].reverse()} getRowId={(c) => c.id} rowNoun={['change', 'changes']} cardSummary empty={<EmptyState compact title="No changes yet." />} />
                ) : (
                  <Skeleton height={160} />
                )}
              </Card>
              {corrected.length > 0 && (
                <Card title="Corrected records">
                  <ul className="yx-hist__corrections">
                    {corrected.map((r) => (
                      <li key={r.id}>
                        <Text weight="medium">{`${range(r.validFrom, r.validTo)}: ${[r.designation?.name, r.department?.name, r.location.name].filter(Boolean).join(' · ')}`}</Text>
                        <Text tone="secondary" size="sm">{`Corrected on ${dateLabel(r.supersededAt!.slice(0, 10))}: ${r.supersededBy?.reason ?? ''}`}</Text>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {payShown && history && history.compensation.some((r) => !r.supersededAt) && (
                <Card title="Pay history">
                  <ul className="yx-hist__corrections">
                    {history.compensation.filter((r) => !r.supersededAt).map((r) => (
                      <li key={r.id}>
                        <Text weight="medium">{money(r.annualCtc, r.currency)}</Text>
                        <Text tone="secondary" size="sm">{range(r.validFrom, r.validTo)}</Text>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {changing && change && personId && <ChangeDrawer options={change.options} employeeId={personId} onPreview={change.onPreview} onSubmit={change.onSubmit} onClose={() => setChanging(false)} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
